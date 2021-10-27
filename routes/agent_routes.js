const express = require('express');
const {NodeSSH} = require('node-ssh')


const AgentModel = require('../models/Agent');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const router = express.Router();

const ssh = new NodeSSH()


router.post('/create/team', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        if(found_invalid_ids([user_id])){
            res.json({error : "The given User ID is not valid."});
            return;
        }
        // user_id = await mongoose.Types.ObjectId(user_id);
        // console.log(user.team.level);
        User.findById({ 
            _id : user_id
        }).populate('team_id').exec(async (err, user) => {
            if(!user || err) res.json(handle_error("Could not retrieve valid data from database."));

            const team = user.team_id;
            const caps = get_capacity(team.level);
            const isRoot = is_root(team.root, user_id);
            console.log(team);
            if(
                !(
                    isRoot || 
                    (team.agent_admins.has(user_id) && 
                    team.agent_admins[user_id] === true)
                )
            ){
                console.log(isRoot, user_id, team.root)
                return res.json(not_authenticated);
            }

            // Step 1 : Check for vacancy.
            if(team.agents.size >= caps.agents) return res.json(handle_error("Max agents limit exceeded."));

            // Step 2 : Check if the given remote agent is accessible.
            const creds = {
                host : data.host,
                username : data.username,
                ...(data.password) && { password : data.password },
                ...(data.privateKey) && { privateKey : data.privateKey },
                ...(data.passphrase) && { passphrase : data.passphrase },
            }
            if(!data.private){
                try {
                    let connection = await ssh.connect(creds);
                    if(!connection.isConnected){
                        return res.json(handle_error({
                            error : null,
                            message : "Could not confirm remote connectivity, are you sure you entered the right credentials?",
                        }));
                    }
                } catch (err) {
                    console.log('here');
                    return res.json(handle_error({
                        error : err,
                        message : "Could not confirm remote connectivity, are you sure you entered the right credentials?",
                    }));
                }
            }
            // Step 3 : Create the agent
            data.creds = creds;
            try {
                const agent = await AgentModel.create(data);
                // Step 4 : Set update info
                let update_data = {
                    [`agents.${agent._id}`]: true,
                    $inc : { agent_occupancy : 1 }
                }
                // Step 5 : Push all updates for team.
                TeamModel.updateOne({
                    _id: team._id,
                },
                update_data
                , (err, doc) => {
                    if (err) {
                        console.log(handle_error("Couldn't update Team"));
                    }
                });
                res.json(handle_success({
                    message : "Agent created successfully!",
                    agent : agent
                }))
            } catch (err) {
                console.log(err);
                console.log("Error here");
                return res.json(handle_error(err.message));
            } 
        });
        return;
    } catch (err) {
        console.log(err);
        res.json({error : err});
    }
})
// Done!
router.post('/create/user', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        if(found_invalid_ids([user_id])){
            res.json({error : "The given User ID is not valid."});
            return;
        }
        // user_id = await mongoose.Types.ObjectId(user_id);
        // console.log(user.team.level);
        User.findById({ 
            _id : user_id
        }).populate('team_id').exec(async (err, user) => {
            if(!user || err) res.json(no_docs_or_error);

            const team = user.team_id;
            const caps = get_capacity(team.level);
            const isRoot = is_root(team.root, user_id);

            // Step 1 : Check for vacancy.
            if(team.agent_occupancy >= caps.agents) return res.json(handle_error("Max agents limit exceeded."));

            // Step 2 : Check if the given remote agent is accessible.
            const creds = {
                host : data.host,
                username : data.username,
                ...(data.password) && { password : data.password },
                ...(data.privateKey) && { privateKey : data.privateKey },
                ...(data.passphrase) && { passphrase : data.passphrase },
            }
            // if(!data.private){
            //     try {
            //         let connection = await ssh.connect(creds);
            //         if(!connection.isConnected){
            //             return res.json(handle_error({
            //                 error : null,
            //                 message : "Could not confirm remote connectivity, are you sure you entered the right credentials?",
            //             }));
            //         }
            //     } catch (err) {
            //         return res.json(handle_error({
            //             error : err,
            //             message : "Could not confirm remote connectivity, are you sure you entered the right credentials?",
            //         }));
            //     }
            // }
            // Step 3 : Create the agent
            data.creds = creds;
            try {
                const agent = await AgentModel.create(data);
                // Step 4 : Update user_agents array for the current team.
                var updateInfo = {
                    $inc : { agent_occupancy : 1 }
                };
                if(!team.user_agents.has(user_id) || !team.user_agents.get(user_id)){
                    updateInfo[`user_agents.${user_id}`] = {
                        [`${agent._id}`] : true
                    }
                    
                }else{
                    updateInfo[`user_agents.${user_id}.${agent._id}`] = true;
                    
                }
                TeamModel.updateOne({
                    _id: team._id,
                }, 
                updateInfo,
                (err, doc) => {
                    if (err) {
                        console.log(user_id, agent._id), 
                        console.log(err, handle_error("Couldn't update Team"));
                    }
                });
                res.json(handle_success({
                    message : "Agent created successfully!",
                    agent : agent
                }))
            } catch (err) {
                console.log(err);
                return res.json(handle_error(err.message));
            } 
        });

        // res.json({data : data})
        return;
    } catch (err) {
        console.log(err);
        res.json({error : err});
    }
})

router.post('/update', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const agent_id = data.agent_id;
    data._id = agent_id;
    if(!(user_id || team_id || agent_id)){
        return res.json("Insufficient parameters.");
    }
    if(!(isValidObjectId(user_id) || isValidObjectId(agent_id) || isValidObjectId(team_id))){
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
        console.log(team.agents);
        if( 
            //Agent exists in the team
            !(
                team.agents.has(agent_id) && 
                (
                    // if current user is root user.
                    isRoot || 
                    // if current user is a agent admin.
                    team.agent_admins.has(user_id) || 
                    // if selected agent has been assigned to the current user.
                    (team.assigned_agents.has(user_id) && team.assigned_agents[user_id][agent_id] === true)
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the agent
            AgentModel.findByIdAndUpdate({ 
                _id: agent_id
            }, 
            data, {new : true})
            .select('-creds')
            .exec(
            (err,resp) => {
                if(err){
                    return res.json(handle_error("There was an error while updating your agent."));
                }
                    return res.json(handle_success({
                        message : "Agent updated successfully.",
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
            // team.agents.has(agent_id) && 
            (   
                isRoot || 
                ( team.agent_admins.has(user_id) && team.agent_admins[user_id] === true )
            )
        ){
            // Enumerate the agent
            let agents_array = Array.from( team.agents.keys() );
            return res.json(handle_success(
                await AgentModel.find({
                    _id : {
                        $in : agents_array
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
        // console.log(team.user_devices);
        if(!team || err){
            res.json(handle_error("Your agent could not be identified."));
        }
    
        return res.json(handle_success(team.user_agents.get(user_id)));

    });
})

router.post('/enumerate/agent', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const agent_id = data.agent_id;
    if( found_invalid_ids([user_id, team_id, agent_id]) ){
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
            team.agents.has(agent_id) && 
            (   
                isRoot || 
                ( team.agent_admins.has(user_id) && team.agent_admins[user_id] === true ) || 
                (team.assigned_agents.has(user_id) && team.assigned_agents[user_id][agent_id] === true)
            )
        ){
            // Enumerate the agent
            var agent = {};
            if(data.show_creds){
                agent = await AgentModel.findById({ 
                    _id : agent_id
                });
                return res.json(handle_success(agent));
            }
            return res.json( 
                await AgentModel.findById({ 
                _id : agent_id
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
    const agent_id = data.agent_id;
    if(!(user_id || team_id || agent_id)){
        return res.json("Insufficient parameters.");
    }

    if(found_invalid_ids([user_id, team_id, agent_id])){
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
                return res.json(handle_error("There was an error while deleting your agent."));
            }else{
                team.agents.delete(agent_id);
                TeamModel.updateOne({
                    _id: team_id
                }, {
                    agents: team.agents,
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

    if(found_invalid_ids([user_id, team_id, agent_id])){
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
                    team.agent_admins.has(user_id) && team.agent_admins[user_id] === true
                )
            )
        ){
            console.log(team.user_agents, user_id)
            return res.json(not_authenticated);
        }

        if( !isRoot && !( team.user_agents.has(delete_user_id) && team.user_agents[delete_user_id].has(agent_id) ) ){
            console.log(team.user_agents, delete_user_id, agent_id);
            return res.json(handle_error("Agent not found."));
        }
        // console.log(team.user_agents.get(delete_user_id), typeof team.user_agents.get(delete_user_id));
        
        try {
            delete team.user_agents.get(delete_user_id)[agent_id];
        } catch (err) {
            return res.json(handle_error("There was an error while deleting your agent."))
        }
        // console.log(team.user_agents.get(delete_user_id))

        //Delete the agent
        AgentModel.deleteOne({
            _id: data.agent_id
        }, (err) => {
            if(err){
                return res.json(handle_error("There was an error while deleting your agent."));
            }else{
                TeamModel.updateOne({ 
                    _id: team_id
                }, 
                {
                    [`user_agents.${delete_user_id}`]: team.user_agents[delete_user_id],
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