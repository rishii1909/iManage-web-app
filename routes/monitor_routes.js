const express = require('express');
const {NodeSSH} = require('node-ssh')


const MonitorModel = require('../models/Monitor');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const DeviceModel = require('../models/Device');
const router = express.Router();

const ssh = new NodeSSH()


router.post('/create', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_id = data.device_id;
        let team_id = data.team_id;
        if(found_invalid_ids([user_id])){
            res.json({error : "The given User ID is not valid."});
            return;
        }

        User.findById({ 
            _id : user_id
        }).populate('team_id').exec(async (err, user) => {
            if(!user || err) res.json(handle_error("Could not retrieve valid data from database."));

            const team = user.team_id;
            const caps = get_capacity(team.level);
            const isRoot = is_root(team.root, user_id);
            // Check for permissions first.
            if(
                !(
                    isRoot || 
                    (
                        team.monitor_admins.has(user_id) && 
                        team.monitor_admins.get(user_id) === true
                    )
                )
            ){
                console.log(isRoot, user_id, team.root)
                return res.json(not_authenticated);
            }

            // Step 1 : Check for vacancy.
            if(team.monitor_occupancy >= caps.monitors) return res.json(handle_error("Max monitors limit exceeded."));

            // Step 2 : Create the monitor
            try {
                const monitor = await MonitorModel.create(data);
                if(!monitor) return res.json(handle_error("Monitor could not be created."));

                // Step 3 : Set update info
                let update_device = {
                    [`monitors.${monitor._id}`]: true,
                }
                let update_team = {
                    $inc : { monitor_occupancy : 1 }
                }
                // Step 4 : Push all updates for team.
                const device_update = await DeviceModel.updateOne(
                    {
                        _id: device_id,
                    },
                    update_device
                );
                console.log(device_update);
                const team_update = await TeamModel.updateOne(
                    {
                        _id : team._id,
                    },
                    update_team
                );
                console.log(team_update);
                res.json(handle_success({
                    message : "Monitor created successfully!",
                    monitor : monitor
                }))
            } catch (err) {
                console.log(err);
                return res.json(handle_error(err.message));
            } 
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
    const monitor_ref = data.monitor_ref;
    data._id = monitor_id;
    if(!(user_id || team_id || monitor_id)){
        return res.json("Insufficient parameters.");
    }
    if(!(isValidObjectId(user_id) || isValidObjectId(monitor_id) || isValidObjectId(team_id))){
        res.json({error : "The given ID is not valid."});
        return;
    }
    TeamModel.findById({
        _id : team_id
    }, (err, team) => {
        if(!team || err){
            return res.json(handle_error("Could not retrieve valid data from database."));
        }
        let isRoot = is_root(team.root, user_id);
        console.log(team.monitors);
        if( 
            //Monitor exists in the team
            !(
                team.monitors.has(monitor_id) && 
                (
                    // if current user is root user.
                    isRoot || 
                    // if current user is a monitor admin.
                    team.monitor_admins.has(user_id) || 
                    // if selected monitor has been assigned to the current user.
                    (team.assigned_monitors.has(user_id) && team.assigned_monitors.get(user_id)[monitor_id] === true)
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the monitor
            MonitorModel.findByIdAndUpdate(
                { _id: monitor_id }, 
                data, 
                { new : true },
                (err,resp) => {
                    if(err){
                        return res.json(handle_error("There was an error while updating your monitor."));
                    }
                        return res.json(handle_success({
                            message : "Monitor updated successfully.",
                            response : resp,
                        }));
                
                }
            )

    });
})
router.post('/update/user', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;
    data._id = monitor_id;
    if(!(user_id || team_id || monitor_id)){
        return res.json("Insufficient parameters.");
    }
    if(!(isValidObjectId(user_id) || isValidObjectId(monitor_id) || isValidObjectId(team_id))){
        res.json({error : "The given ID is not valid."});
        return;
    }
    TeamModel.findById({
        _id : team_id
    }, (err, team) => {
        if(!team || err){
            return res.json(handle_error("Could not retrieve valid data from database."));
        }
        let isRoot = is_root(team.root, user_id);
        if( 
            //Monitor exists in the team
            !(
                (
                    // if current user is root user.
                    isRoot || 
                    // if current user owns the monitor.
                    team.user_monitors.has(user_id) && team.user_monitors.get(user_id)[monitor_id] === true
                    
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the monitor
            MonitorModel.findByIdAndUpdate({ 
                _id: monitor_id
            }, 
            data, {new : true})
            .select('-creds')
            .exec(
            (err,resp) => {
                if(err){
                    return res.json(handle_error("There was an error while updating your monitor."));
                }
                    return res.json(handle_success({
                        message : "Monitor updated successfully.",
                        response : resp,
                    }));
            
            });

    });
})

router.post('/enumerate/team', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    console.log(user_id, team_id);
    if( found_invalid_ids([user_id, team_id]) ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }

    TeamModel.findById({ 
        _id : team_id
    }, async (err, team) => {

        if(!team || err){
            res.json(handle_error("Your team could not be identified."));
        }
    
        let isRoot = is_root(team.root, user_id);

        if(
            // team.monitors.has(monitor_id) && 
            (   
                isRoot || 
                ( team.monitor_admins.has(user_id) && team.monitor_admins[user_id] === true )
            )
        ){
            // Enumerate the monitor
            let monitors_array = Array.from( team.monitors.keys() );
            return res.json(handle_success(
                await MonitorModel.find({
                    _id : {
                        $in : monitors_array
                    }
                })
            ));
        }else{
            return res.json(not_authenticated);
        }

    });
})
router.post('/enumerate/user', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    // console.log("user_id : ", user_id,"team_id : ", team_id);
    if( found_invalid_ids([user_id, team_id]) ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }

    TeamModel.findById({ 
        _id : team_id
    }, async (err, team) => {
        // console.log(team.user_monitors);
        if(!team || err){
            res.json(handle_error("Your team could not be identified."));
        }
        const monitors_array = Object.keys(team.user_monitors.get(user_id));
        
        return res.json(handle_success(
            await MonitorModel.find({
                _id : {
                    $in : monitors_array
                }
            })
        ));

    });
})

router.post('/enumerate/monitor', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;
    if( found_invalid_ids([user_id, team_id, monitor_id]) ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }

    TeamModel.findById({
        _id : team_id
    }, async (err, team) => {

        if(!team || err){
            res.json(handle_error("Could not retrieve valid data from database."));
        }
    
        let isRoot = is_root(team.root, user_id);

        if(
            team.monitors.has(monitor_id) && 
            (   
                isRoot || 
                ( team.monitor_admins.has(user_id) && team.monitor_admins[user_id] === true ) || 
                (team.assigned_monitors.has(user_id) && team.assigned_monitors[user_id][monitor_id] === true)
            )
        ){
            // Enumerate the monitor
            var monitor = {};
            if(data.show_creds){
                monitor = await MonitorModel.findById({ 
                    _id : monitor_id
                });
                return res.json(handle_success(monitor));
            }
            return res.json( 
                await MonitorModel.findById({ 
                _id : monitor_id
                }).select('-creds -username -team')
            )
        }else{
            return res.json(handle_error("You're not authenticated to perform this operation."));
        }

    });
})

router.post('/delete/team', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;
    if(!(user_id || team_id || monitor_id)){
        return res.json("Insufficient parameters.");
    }

    if(found_invalid_ids([user_id, team_id, monitor_id])){
        return res.json(handle_error("Invalid parameter [id]s."))
    }
    TeamModel.findById({
        _id : team_id
    }, (err, team) => {

        if(!team || err){
            return res.json(handle_error(err));
        }
        const isRoot = is_root(team.root, user_id);
        if(
            // team.monitors.has(monitor_id) && 
            !(   
                isRoot || 
                ( team.monitor_admins.has(user_id) && team.monitor_admins.get(user_id) === true ) || 
                (team.assigned_monitors.has(user_id) && team.assigned_monitors.get(user_id)[monitor_id] === true)
            )
        ){
            console.log("Root  : ", team.root, "User ID : ", user_id)
            return res.json(handle_error("You're not authenticated to perform this operation."));
        }
        //Delete the monitor
        MonitorModel.deleteOne({
            _id: data.monitor_id
        }, (err) => {
            if(err){
                return res.json(handle_error("There was an error while deleting your monitor."));
            }else{
                team.monitors.delete(monitor_id);
                TeamModel.updateOne({
                    _id: team_id
                }, {
                    monitors: team.monitors,
                    $inc : { monitor_occupancy : -1 }
                },
                (err) => {
                   if(err){
                       console.log(`Error: ` + err)
                   }
                });
                return res.json(handle_success("Monitor deleted successfully."));
            }
        });
        
    });
})

router.post('/delete/user', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const delete_user_id = data.delete_user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;

    if(!(user_id || team_id || monitor_id)){
        return res.json("Insufficient parameters.");
    }

    if(found_invalid_ids([user_id, team_id, monitor_id])){
        return res.json(handle_error("Invalid parameter [id]s."))
    }
    TeamModel.findById({
        _id : team_id
    }, (err, team) => {
        // Basic check.
        const invalid = no_docs_or_error(team, err);
        if(invalid.is_true){
            console.log(err, team);
            return res.json(invalid.message);
        }
        // Auth check.
        const isRoot = is_root(team.root, user_id);
        if(
            !(
                isRoot || 
                (
                    team.monitor_admins.has(user_id) && team.monitor_admins[user_id] === true
                )
            )
        ){
            console.log(team.user_monitors, user_id)
            return res.json(not_authenticated);
        }

        if( !isRoot && !( team.user_monitors.has(delete_user_id) && team.user_monitors[delete_user_id].has(monitor_id) ) ){
            console.log(team.user_monitors, delete_user_id, monitor_id);
            return res.json(handle_error("Monitor not found."));
        }
        // console.log(team.user_monitors.get(delete_user_id), typeof team.user_monitors.get(delete_user_id));
        
        try {
            delete team.user_monitors.get(delete_user_id)[monitor_id];
        } catch (err) {
            return res.json(handle_error("There was an error while deleting your monitor."))
        }
        // console.log(team.user_monitors.get(delete_user_id))

        //Delete the monitor
        MonitorModel.deleteOne({
            _id: data.monitor_id
        }, (err) => {
            if(err){
                return res.json(handle_error("There was an error while deleting your monitor."));
            }else{
                TeamModel.updateOne({ 
                    _id: team_id
                }, 
                {
                    [`user_monitors.${delete_user_id}`]: team.user_monitors[delete_user_id],
                    $inc : { monitor_occupancy : -1 }
                },
                (err) => {
                   if(err){
                       console.log(`Error: ` + err)
                   }
                });
                return res.json(handle_success("Monitor deleted successfully."));
            }
        });
        
    });
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    const ids_array = JSON.parse(data.monitor_ids);
    await MonitorModel.find().where('_id').in(ids_array).select('-creds').exec((err, resp) => {
        if(err){
            res.json(handle_error(err));
        }else{
            res.json(handle_success(resp))
        }
    });
})

module.exports = router;

snmp_responses = {
    0 : "No SNMP support",
    1 : "SNMP v1",
    2 : "SNMP v2",
    3 : "SNMP v3",
}