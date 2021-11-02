const express = require('express');
const {NodeSSH} = require('node-ssh')


const AgentModel = require('../models/Agent');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId, Mongoose } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated, not_found, handle_generated_error, maximum_limit_error } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const MonitorModel = require('../models/Monitor');
const router = express.Router();

const ssh = new NodeSSH()

const verbose = "agent"
router.post('/create/team', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        if(found_invalid_ids([user_id, team_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."));
            return;
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            
            const caps = get_capacity(team.level)
            if(team.agent_occupancy >= caps.agents) return res.json(maximum_limit_error(verbose))


            if(
                !(
                    is_root(team.root, user_id) || 
                    (team.monitoring_admins.has(user_id) && 
                    team.monitoring_admins.get(user_id) === true)
                )
            ){
                return res.json(not_authenticated);
            }

            const final_agent_object = {
                ...(data.name) && { name : data.name },
                ...(data.private) && { private : data.private },
                ...(data.api_url) && { api_url : data.api_url },
                ...(data.additional_info) && { additional_info : data.additional_info },
                ...(data.team_id) && { team_id : data.team_id },
                ...(data.type) && { type : data.type },
                team_id : team_id
            }

            try {
                const agent = await AgentModel.create(final_agent_object);
                if(!agent) return res.json(handle_error("There was an error while creating your agent."))
                // Step 4 : Set update info
                let update_data = {
                    $push : { [`agents`] : agent._id.toString() },
                    $inc : { agent_occupancy : 1 }
                }
                // Step 5 : Push all updates for team.
                TeamModel.updateOne({
                    _id: team._id,
                },
                update_data
                , (err, doc) => {
                    if (err) {
                        return res.json(handle_generated_error(err));
                    }
                    if(!doc) return res.json(not_found("Team"));

                    res.json(handle_success({
                        message : "Agent created successfully!",
                        agent : agent
                    }))
                });
            } catch (err) {
                return res.json(handle_generated_error(err));
            }

        });
        
    } catch (err) {
        console.log(err);
        res.json(handle_generated_error(err));
    }
})

router.post('/create/user', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        if(found_invalid_ids([user_id, team_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."));
            return;
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            
            const caps = get_capacity(team.level)
            if(team.agent_occupancy >= caps.agents) return res.json(maximum_limit_error(verbose))

            const final_agent_object = {
                ...(data.name) && { name : data.name },
                ...(data.private) && { private : data.private },
                ...(data.api_url) && { api_url : data.api_url },
                ...(data.additional_info) && { additional_info : data.additional_info },
                ...(data.team_id) && { team_id : data.team_id },
                ...(data.type) && { type : data.type },
                team_id : team_id
            }

            try {
                const agent = await AgentModel.create(final_agent_object);
                // Step 4 : Set update info
                let update_data = {
                    $push : { [`user_agents.${user_id}`] : agent._id.toString() },
                    $inc : { agent_occupancy : 1 }
                }
                // Step 5 : Push all updates for team.
                TeamModel.updateOne({
                    _id: team._id,
                },
                update_data
                , (err, doc) => {
                    if (err) {
                        return res.json(handle_generated_error(err));
                    }
                    if(!doc) return res.json(not_found("Team"));

                });
                res.json(handle_success({
                    message : "Agent created successfully!",
                    agent : agent
                }))
            } catch (err) {
                return res.json(handle_generated_error(err));
            }

        });
        
    } catch (err) {
        console.log(err);
        res.json(handle_generated_error(err));
    }
})

router.post('/update/team', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        let agent_id = data.agent_id;
        if(found_invalid_ids([user_id, team_id, agent_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."))
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            
            if(!team.agents.includes(agent_id)) return res.json(handle_error("Agent not found in your Team."))
            if(
                !(
                    is_root(team.root, user_id) || 
                    (team.monitoring_admins.has(user_id) && 
                    team.monitoring_admins.get(user_id) === true)
                )
            ){
                return res.json(not_authenticated);
            }

            const update_agent_object = {
                ...(data.name) && {name : data.name},
                ...(data.team_id) && {team_id : data.team_id},
                ...(data.snmp) && {snmp : data.snmp},
                ...(data.type) && {type : data.type},
                
            }

            // const creds = {
            //     ...(data.username) && {username : data.username},
            //     ...(data.host) && {host : data.host},
            //     ...(data.password) && { password : data.password },
            //     ...(data.privateKey) && { privateKey : data.privateKey },
            //     ...(data.passphrase) && { passphrase : data.passphrase },
            // }
            // if(creds.keys(obj).length !== 0){
            //     update_agent_object.creds = creds;
            // }

            AgentModel.findOneAndUpdate({
                _id: agent_id,
            }, update_agent_object, 
            {new : true},
            (err, agent) => {
                if (err) {
                    return res.json(handle_generated_error(err))
                }
                if(!agent) return res.json(not_found("Agent"))

                return res.json(handle_success(agent))
            });

        });
        
    } catch (err) {
        console.log(err);
        res.json(handle_generated_error(err));
    }
})

router.post('/update/user', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        let agent_id = data.agent_id;
        if(found_invalid_ids([user_id, team_id, agent_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."))
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            if(!(
                team.user_agents.has(user_id) && team.user_agents.get(user_id).includes(agent_id)
            )) return res.json(handle_error("Agent not found in your account."))


            const update_agent_object = {
                ...(data.name) && {name : data.name}, 
                ...(data.team_id) && {team_id : data.team_id},
                ...(data.snmp) && {snmp : data.snmp},
                ...(data.type) && {type : data.type},
                
            }

            // const creds = {
            //     ...(data.username) && {username : data.username},
            //     ...(data.host) && {host : data.host},
            //     ...(data.password) && { password : data.password },
            //     ...(data.privateKey) && { privateKey : data.privateKey },
            //     ...(data.passphrase) && { passphrase : data.passphrase },
            // }
            // if(creds.keys(obj).length !== 0){
            //     update_agent_object.creds = creds;
            // }

            AgentModel.findOneAndUpdate({
                _id: agent_id,
            }, update_agent_object, 
            {new : true},
            (err, agent) => {
                if (err) {
                    return res.json(handle_generated_error(err))
                }
                if(!agent) return res.json(not_found("Agent"))

                return res.json(handle_success(agent))
            });

        });
        
    } catch (err) {
        console.log(err);
        res.json(handle_generated_error(err));
    }
})

router.post('/enumerate/team', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        let agent_id = data.agent_id;
        if(found_invalid_ids([user_id, team_id, agent_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."))
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            
            // if(
            //     !(
            //         is_root(team.root, user_id) || 
            //         (team.monitoring_admins.has(user_id) && 
            //         team.monitoring_admins.get(user_id) === true)
            //     )
            // ){
            //     return res.json(not_authenticated);
            // }
            if(team.agents.length == 0) return res.json(handle_success([]));
            AgentModel.find(
                {
                    _id : {
                        $in : team.agents
                    }
                }).select("-creds").exec((err, docs) => {
                    if(err) return res.json(handle_generated_error(err))

                    return res.json(handle_success(docs))
                });

        });
        
    } catch (err) {
        console.log(err);
        res.json(handle_generated_error(err));
    }
})

router.post('/enumerate/user', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        if(found_invalid_ids([user_id, team_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."))
        }
        TeamModel.findById({
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            
            if(team.user_agents.get(user_id).length == 0) return res.json(handle_success([]));
            AgentModel.find(
                {
                    _id : {
                        $in : team.user_agents.get(user_id)
                    }
                }).select("-creds").exec((err, docs) => {
                    if(err) return res.json(handle_generated_error(err))

                    return res.json(handle_success(docs))
                });

        });
        
    } catch (err) {
        console.log(err);
        res.json(handle_generated_error(err));
    }
})

router.post('/enumerate/agent', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const agent_id = data.agent_id;
    if( found_invalid_ids([user_id, team_id, agent_id]).invalid ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }

    TeamModel.findById({
        _id : team_id
    }, async (err, team) => {

        if(!team || err){
            res.json(handle_error("Could not retrieve valid data from database."));
        }
    
        // Enumerate the agent
        var agent = {};
        if(data.show_creds){
            agent = await AgentModel.findById(
                { 
                    _id : agent_id
                }, 
            );
        }else{
            agent = await AgentModel.findById(
                {
                    _id : agent_id
                }, 
            ).select('-creds -username -team');

        }
        if(data.show_monitors){
            let obtained_monitors = {};
            let obtained_monitors_array = [];
            agent.monitors.forEach(agent => {
                for (const agent_key in agent) {
                    if (Object.hasOwnProperty.call(agent, agent_key)) {
                        const category = agent[agent_key];
                        obtained_monitors[agent_key] = [];
                        for (const category_key in category) {
                            if (Object.hasOwnProperty.call(category, category_key)) {
                                const monitor = category[category_key];
                                // Waiting for approval
                                // obtained_monitors[agent_key].push(category_key);
                                obtained_monitors_array.push(category_key)
                            }
                        }
                    }
                }
            });
            

            await MonitorModel.find({
                _id : {
                    $in : obtained_monitors_array
                }
            },
            (err, monitors) => {
                console.log('here')
                if(err) return res.json(handle_error(err))

                if(!monitors) return res.json(handle_error({message : "No monitors found."}))

                return res.json(handle_success({...(agent.toObject()), ...{monitors : monitors} }))
            });

            // Waiting for approval
            // for (const key in obtained_monitors) {
            //     if (Object.hasOwnProperty.call(obtained_monitors, key)) {
            //         var category = obtained_monitors[key];
            //         await MonitorModel.find({
            //             _id : {
            //                 $in : category
            //             }
            //         },
            //         (err, monitors) => {
            //             obtained_monitors[key] = monitors;
            //         });
            //     }
            // }
            
        }
        
        return res.json(handle_success(agent));

    });
})

router.post('/delete/team', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const agent_id = data.agent_id;
    if(!(user_id || team_id || agent_id)){
        return res.json("Insufficient parameters.");
    }

    if(found_invalid_ids([user_id, team_id, agent_id]).invalid){
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
            // team.agents.has(agent_id) && 
            !(   
                isRoot || 
                ( team.agent_admins.has(user_id) && team.agent_admins.get(user_id) === true ) || 
                (team.assigned_agents.has(user_id) && team.assigned_agents.get(user_id)[agent_id] === true)
            )
        ){
            console.log("Root  : ", team.root, "User ID : ", user_id)
            return res.json(handle_error("You're not authenticated to perform this operation."));
        }
        //Delete the agent
        AgentModel.deleteOne({
            _id: data.agent_id
        }, (err) => {
            if(err){
                return res.json(handle_generated_error(err));
            }else{
                TeamModel.updateOne({
                    _id: team_id
                }, {
                    $pull : {agents : data.agent_id},
                    $inc : { agent_occupancy : -1 }
                },
                (err) => {
                   if(err){
                       console.log(`Error: ` + err)
                   }
                });
                return res.json(handle_success("Agent deleted successfully."));
            }
        });
        
    });
})

router.post('/delete/user', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const delete_user_id = data.delete_user_id;
    const team_id = data.team_id;
    const agent_id = data.agent_id;

    if(!(user_id || team_id || agent_id)){
        return res.json("Insufficient parameters.");
    }

    if(found_invalid_ids([user_id, team_id, agent_id]).invalid){
        return res.json(handle_error("Invalid parameter [id]s."))
    }
    TeamModel.findById({
        _id : team_id
    }, (err, team) => {
        // Basic check.
        if(err) return res.json(handle_generated_error(err))
        if(!team) return res.json(not_found("Team"))

    
        if(!team.user_agents.has(user_id)) return res.json(handle_error("There are no agents in your account."))
        if(!team.user_agents.get(user_id).includes(agent_id)) return res.json(handle_error("The agent you're trying to delete is not present in your account."))
        
        // console.log(team.user_agents.get(delete_user_id))

        //Delete the agent
        AgentModel.deleteOne({
            _id: data.agent_id
        }, (err) => {
            if(err){
                return res.json(handle_generated_error(err));
            }else{
                TeamModel.updateOne({
                    _id: team_id
                }, {
                    $pull : {[`user_agents.${user_id}`] : agent_id},
                    $inc : { agent_occupancy : -1 }
                },
                (err) => {
                   return res.json(handle_generated_error(err))
                });
                return res.json(handle_success("Agent deleted successfully."));
            }
        });
        
    });
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    const ids_array = JSON.parse(data.agent_ids);
    await AgentModel.find().where('_id').in(ids_array).select('-creds').exec((err, resp) => {
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