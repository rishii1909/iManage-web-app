const express = require('express');
const {NodeSSH} = require('node-ssh')


const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated, validate_response, not_found, handle_generated_error } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const DeviceModel = require('../models/Device');
const DeviceGroupModel = require('../models/DeviceGroup');
const router = express.Router();
const verbose = "Device Group"

router.post('/add', async (req, res, next) => {
    try {
        const data = req.body;
        let device_group_id = data.device_group_id;
        let devices = data.devices;
        let analytic_groups = data.analytic_groups;
        let push_updates = {};

        if(devices && Array.isArray(devices) && devices.length !== 0){
            push_updates.devices = {
                $each : devices,
            }
        }
        if(analytic_groups && Array.isArray(analytic_groups) && analytic_groups.length !== 0){
            push_updates.analytic_groups = {
                $each : analytic_groups,
            }
        }
        if(Object.keys(push_updates).length == 0) return res.json(handle_error("No devices or analytic groups provided."))
        DeviceGroupModel.findOneAndUpdate({
            _id: device_group_id,
        }, {
            $push : push_updates
        },
        { 
            new : true 
        }, 
        (err, doc) => {
            if (err) {
                return res.json(handle_error(err))
            }
            if(!doc) return res.json(not_found("Device Group"));

            return res.json(handle_success(doc))
        });

    } catch (err) {
        console.log(err);
        res.json(handle_error(err))
    }
})

router.post('/remove', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_group_id = data.device_group_id;
        let devices = data.devices;
        let analytic_groups = data.analytic_groups;
        let pull_updates = {};

        if(devices && Array.isArray(devices) && devices.length !== 0){
            pull_updates.devices = {
                $in : devices,
            }
        }
        if(analytic_groups && Array.isArray(analytic_groups) && analytic_groups.length !== 0){
            pull_updates.analytic_groups = {
                $in : analytic_groups,
            }
        }
        if(Object.keys(pull_updates).length == 0) return res.json(handle_error("No devices or analytic groups provided."))

        DeviceGroupModel.findOneAndUpdate({
            _id: device_group_id,
        }, {
            $pull : pull_updates
        },
        { 
            new : true 
        }, 
        (err, doc) => {
            if (err) {
                return res.json(handle_error(err))
            }
            if(!doc) return res.json(not_found("Device Group"));

            return res.json(handle_success(doc))
        });

    } catch (err) {
        res.json(handle_error(err))
    }
})

router.post('/enumerate', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_group_id = data.device_group_id;

        DeviceGroupModel.findOne({
            _id: device_group_id,
        })
        .populate([
            {
                path : "analytic_groups",
                select : "name"
            },
            {
                path : "devices",
                select : "name type"
            }
        ])
        // .populate("analytic_groups devices")
        .exec((err, device_group) => {
            if(err){
                return res.json(handle_generated_error(err));
            }
            if (!device_group) {
                return res.json(not_found("Device Group"));
            }
            return res.json(handle_success(device_group));
        });

    } catch (err) {
        res.json(handle_generated_error(err))
    }
})
router.post('/create', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        const id_check = found_invalid_ids([user_id, team_id], res)
        if(id_check.invalid){
            return id_check.message;
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            
            validate_response(err, team, "Team", res, async () => {
                const isRoot = is_root(team.root, user_id);
                // Check for permissions first.
                if(
                    !(
                        isRoot || 
                        (
                            team.device_admins.has(user_id) &&
                            team.device_admins.get(user_id) === true
                        )
                    )
                ){
                    return res.json(not_authenticated);
                }
                try {
                    const device_group = await DeviceGroupModel.create(data);
                    if(!device_group) return res.json(handle_error("Device Group could not be created."));  
                    // Step 3 : Set update info
                    let update_device_group = {
                        $push : {
                            device_groups : device_group._id,
                        }
                    }
                    // Step 4 : Push all updates for team.
                    const team_update = await TeamModel.updateOne(
                        {
                            _id : team._id,
                        },
                        update_device_group
                    );
                    res.json(handle_success({
                        message : "Device Group created successfully!",
                        device_group : device_group
                    }))
                } catch (err) {
                     console.log(err);
                     return res.json(handle_error(err.message));
                }
            })
        });
        return;
    } catch (err) {
        console.log(err);
        res.json(handle_error(err));
    }
})


router.post('/update', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const device_group_id = data.device_group_id

    const ic = found_invalid_ids([user_id, team_id, device_group_id], res);
    if(ic.invalid) return res.json(ic.message);

    TeamModel.findById({
        _id : team_id
    }, (err, team) => {

        if(err) return res.json(handle_generated_error(err));
        if(!team) return res.json(not_found("Team"));
        let isRoot = is_root(team.root, user_id);
        if(
            !(
                isRoot || 
                (
                    team.device_admins.has(user_id) && 
                    team.device_admins.get(user_id) === true
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the Device group
            DeviceGroupModel.findOneAndUpdate({
                _id: device_group_id,
            }, 
            data, 
            (err, device_group) => {
                const invalid = no_docs_or_error(device_group, err);
                if(invalid.is_true) return res.json(invalid.message);

                res.json(handle_success({
                    message : "Device group updated successfully!",
                    device_group : device_group
                }));
            });
            

    });
})


router.post('/delete', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const device_group_id = data.device_group_id
    if(!(user_id || team_id || device_group_id)){
        return res.json(handle_error("Insufficient parameters."));
    }

    if(!(isValidObjectId(user_id) || isValidObjectId(monitor_id) || isValidObjectId(team_id))){
        return res.json({error : "The given ID is not valid."});
        
    }

    TeamModel.findById({
        _id : team_id
    }, (err, team) => {
        const invalid = no_docs_or_error(team, err);
        if(invalid.is_true) return res.json(invalid.message)


        let isRoot = is_root(team.root, user_id);
        if(
            !(
                isRoot || 
                (
                    team.device_admins.has(user_id) && 
                    team.device_admins.get(user_id) === true
                )
            )
        ){
            return res.json(not_authenticated);
        }
        
            //Delete the Device group
            DeviceGroupModel.findOneAndDelete({ 
                _id: device_group_id
            }, (err, doc) => {
               const invalid = no_docs_or_error(doc, err);
               if(invalid.is_true) return res.json(invalid.message);

                TeamModel.findOneAndUpdate({
                    _id: team_id,
                }, 
                {
                    $pull : {
                        device_groups : device_group_id,
                    }    
                }, 
                (err, doc) => {
                    const invalid = no_docs_or_error(doc, err);
                    if(invalid.is_true) return res.json(invalid.message);

                    return res.json(handle_success("Device Group deleted successfully!"))
                });
            });
    });
})

module.exports = router;

snmp_responses = {
    0 : "No SNMP support",
    1 : "SNMP v1",
    2 : "SNMP v2",
    3 : "SNMP v3",
}