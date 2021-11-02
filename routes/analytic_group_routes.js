const express = require('express');
const {NodeSSH} = require('node-ssh')


const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated, validate_response, not_found } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const MonitorModel = require('../models/Monitor');
const MonitorGroupModel = require('../models/AnalyticGroup');
const router = express.Router();
const verbose = "Analytic Group"

router.post('/add', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let analytic_group_id = data.analytic_group_id;
        let monitor_id = data.monitor_id;
        MonitorGroupModel.findOneAndUpdate({
            _id: analytic_group_id,
        }, {
            [`monitors.${monitor_id}`]: true,
        },
        { 
            new : true 
        }, 
        (err, doc) => {
            if (err) {
                return res.json(handle_error(err))
            }
            if(!doc) return res.json(not_found("Analytic group"));

            return res.json(handle_success(doc))
        });

    } catch (err) {
        res.json(handle_error(err))
    }
})

router.post('/remove', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let analytic_group_id = data.analytic_group_id;
        let monitor_id = data.monitor_id;
        MonitorGroupModel.findOneAndUpdate({
            _id: analytic_group_id,
            [`monitors.${monitor_id}`]: true || false,
        }, {
            $unset : {
                [`monitors.${monitor_id}`] : 1
            },
        },
        { 
            new : true 
        }, 
        (err, doc) => {
            if (err) {
                return res.json(handle_error(err))
            }
            if(!doc) return res.json(handle_error("Monitor does not exist in Analytic Group."));

            return res.json(handle_success(doc))
        });

    } catch (err) {
        res.json(handle_error(err))
    }
})
router.post('/disable', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let analytic_group_id = data.analytic_group_id;
        let monitor_id = data.monitor_id;
        MonitorGroupModel.findOneAndUpdate({
            _id: analytic_group_id,
            [`monitors.${monitor_id}`]: true || false,
        }, {
            [`monitors.${monitor_id}`]: false,
        },
        { 
            new : true 
        }, 
        (err, doc) => {
            if (err) {
                return res.json(handle_error(err))
            }
            if(!doc) return res.json(handle_error("Monitor does not exist in Analytic Group."));

            return res.json(handle_success(doc))
        });

    } catch (err) {
        res.json(handle_error(err))
    }
})
router.post('/enable', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let analytic_group_id = data.analytic_group_id;
        let monitor_id = data.monitor_id;
        MonitorGroupModel.findOneAndUpdate({
            _id: analytic_group_id,
            [`monitors.${monitor_id}`]: true || false,
        }, {
            [`monitors.${monitor_id}`]: true,
        },
        { 
            new : true 
        }, 
        (err, doc) => {
            if (err) {
                return res.json(handle_error(err))
            }
            if(!doc) return res.json(handle_error("Monitor does not exist in Analytic Group."));

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
        let analytic_group_id = data.analytic_group_id;
        let monitor_id = data.monitor_id;
        MonitorGroupModel.findOne({
            _id: analytic_group_id,
        }).then((analytic_group) => {
            if (!analytic_group) {
                return res.json(not_found(verbose));
            } else{
                const monitors = Array.from( analytic_group.monitors.keys() )
                MonitorModel.find({ 
                    _id: { $in : monitors}
                }).select("label type monitor_ref").exec((err, docs) => {
                    if(err){
                        return res.json(handle_error(err));
                    } else{
                        return res.json(handle_success(docs))
                    }
                });
            }
        });

    } catch (err) {
        res.json(handle_error(err))
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
                            team.monitor_admins.has(user_id) && 
                            team.monitor_admins.get(user_id) === true
                        )
                    )
                ){
                    return res.json(not_authenticated);
                }   
                try {
                    const analytic_group = await MonitorGroupModel.create(data);
                    if(!analytic_group) return res.json(handle_error("Analytic Group could not be created."));  
                    // Step 3 : Set update info
                    let update_analytic_group = {
                        [`analytic_groups.${analytic_group._id}`]: true,
                    }
                    // Step 4 : Push all updates for team.
                    const team_update = await TeamModel.updateOne(
                        {
                            _id : team._id,
                        },
                        update_analytic_group
                    );
                    res.json(handle_success({
                        message : "Analytic Group created successfully!",
                        analytic_group : analytic_group
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
    const analytic_group_id = data.analytic_group_id

    const ic = found_invalid_ids([user_id, team_id, analytic_group_id], res);
    if(ic.invalid) return res.json(ic.message);
    TeamModel.findById({
        _id : team_id
    }, (err, team) => {

        
        let isRoot = is_root(team.root, user_id);
        if(
            !(
                isRoot || 
                (
                    team.monitor_admins.has(user_id) && 
                    team.monitor_admins.get(user_id) === true
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the Monitor group
            MonitorGroupModel.findOneAndUpdate({
                _id: analytic_group_id,
            }, 
            data, 
            (err, analytic_group) => {
                const invalid = no_docs_or_error(analytic_group, err);
                if(invalid.is_true) return res.json(invalid.message);

                res.json(handle_success({
                    message : "Analytic group updated successfully!",
                    analytic_group : analytic_group
                }));
            });
            

    });
})


router.post('/delete', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const analytic_group_id = data.analytic_group_id
    if(!(user_id || team_id || analytic_group_id)){
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
                    team.monitor_admins.has(user_id) && 
                    team.monitor_admins.get(user_id) === true
                )
            )
        ){
            return res.json(not_authenticated);
        }
        
            //Delete the Monitor group
            MonitorGroupModel.findOneAndDelete({ 
                _id: analytic_group_id
            }, (err, doc) => {
               const invalid = no_docs_or_error(doc, err);
               if(invalid.is_true) return res.json(invalid.message);

                team.analytic_groups.delete(analytic_group_id);
                TeamModel.findOneAndUpdate({
                    _id: team_id,
                }, {
                    analytic_groups: team.analytic_groups,
                }, (err, doc) => {
                    const invalid = no_docs_or_error(doc, err);
                    if(invalid.is_true) return res.json(invalid.message);

                    return res.json(handle_success("Analytic Group deleted successfully!"))
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