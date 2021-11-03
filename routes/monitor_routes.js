const express = require('express');
const {NodeSSH} = require('node-ssh')


const MonitorModel = require('../models/Monitor');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated, check_monitor_type, invalid_monitor_type, binary_monitors, handle_generated_error, not_found } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const DeviceModel = require('../models/Device');
const { default: axios } = require('axios');
const AgentModel = require('../models/Agent');
const { refreshStyles } = require('less');
const NotificationTemplateModel = require('../models/NotificationTemplate');
const router = express.Router();

const ssh = new NodeSSH()


router.post('/create/team', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_id = data.device_id;
        let agent_id = data.agent_id;
        let team_id = data.team_id;
        const monitor_type = data.type;
        if(found_invalid_ids([user_id, device_id, agent_id]).invalid){
            return res.json(handle_error("The given User ID is not valid."));
        }

        if(!check_monitor_type(data.type)) return res.json(invalid_monitor_type());

        AgentModel.findById({
            _id : agent_id
        })
        .select('api_url team_id -_id')
        .populate({
            path : 'team_id',
            select : 'monitor_occupancy level'
        })
        .exec(async (err, agent) => {
            // Check if valid response returned.
            const invalid = no_docs_or_error(agent, err);
            if(invalid.is_true) return res.json(invalid.message);

            // Populated declarations.
            const team = agent.team_id;

            // Check for vacancy.
            if(team.monitor_occupancy >= get_capacity(team.level).monitors) return res.json(handle_error("Max monitors limit exceeded."));

            // Fetch and store device info.
            const device = await DeviceModel.findById({ _id : device_id }).select('-_id creds');
            if(!device) return res.json(handle_error("Device not found."));
            const monitor_info = { ...data, ...(device.creds) };

            // Add code here to check for permissions. Skipped for now.

            // Call the remote agent API to create a new monitor.
            axios.post(

                `${agent.api_url}/api/${data.type}/mutate/create`, // API path
                monitor_info // Data to be sent

            ).then( async response => {
                try {
                    const remote_response = response.data;
                    // If monitor could not be created.
                    if(!remote_response.accomplished) return res.json(remote_response);
                    const monitor = await MonitorModel.create({...monitor_info, ...{monitor_ref : remote_response.agent_id}});
                    if(!monitor) return res.json(handle_error("Monitor was created sucessfully, but could not be added to the central database."));

                    // Step 3 : Set update info
                    let update_device = {
                        [`monitors.${agent_id}.${monitor_type}.${monitor._id}`]: true,
                    }
                    let update_team = {
                        [`monitors.${agent_id}.${monitor_type}.${monitor.monitor_ref}`]: true,
                        // [`user_monitors.${user_id}.${monitor._id}`]: true,
                        $inc : { monitor_occupancy : 1 }
                    }

                    // Step 4 : Push all updates for team.
                    await DeviceModel.updateOne(
                        {
                            _id: device_id,
                        },
                        update_device
                    );
                    await TeamModel.updateOne(
                        {
                            _id : team._id,
                        },
                        update_team
                    );
                    res.json(handle_success({
                        message : "Monitor created successfully!",
                        monitor : {...monitor.toObject(), ...remote_response}
                    }))
                } catch (err) {
                    return res.json(handle_error(err.message));
                }

            }).catch((err) => {
                return res.json(handle_error(err.message ? err.message : err))
            })
        
        })
    } catch (err) {
        res.json(handle_error(err.message));
    }
})

router.post('/create/user', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_id = data.device_id;
        let agent_id = data.agent_id;
        let team_id = data.team_id;
        const monitor_type = data.type;
        if(found_invalid_ids([user_id, device_id, agent_id]).invalid){
            return res.json(handle_error("The given User ID is not valid."));
        }

        if(!check_monitor_type(monitor_type)) return res.json(invalid_monitor_type());

        AgentModel.findById({
            _id : agent_id
        })
        .select('api_url team_id -_id')
        .populate({
            path : 'team_id',
            select : 'monitor_occupancy level'
        })
        .exec(async (err, agent) => {
            // Check if valid response returned.
            const invalid = no_docs_or_error(agent, err);
            if(invalid.is_true) return res.json(invalid.message);

            // Populated declarations.
            const team = agent.team_id;

            // Check for vacancy.
            if(team.monitor_occupancy >= get_capacity(team.level).monitors) return res.json(handle_error("Max monitors limit exceeded."));

            // Fetch and store device info.
            const device = await DeviceModel.findById({ _id : device_id }).select('-_id creds');
            if(!device) return res.json(handle_error("Device not found."));
            console.log(device.creds)
            const monitor_info = { ...data, ...(device.creds) };
            console.log(monitor_info);

            // Add code here to check for permissions. Skipped for now.

            // Call the remote agent API to create a new monitor.
            axios.post(

                `${agent.api_url}/api/${data.type}/mutate/create`, // API path
                monitor_info // Data to be sent

            ).then( async response => {
                try {
                    const remote_response = response.data;
                    // If monitor could not be created.
                    if(!remote_response.accomplished) return res.json(remote_response);
                    const monitor = await MonitorModel.create({...monitor_info, ...{monitor_ref : remote_response.agent_id}});
                    if(!monitor) return res.json(handle_error("Monitor was created sucessfully, but could not be added to the central database."));

                    // Step 3 : Set update info
                    let update_device = {
                        [`monitors.${agent_id}.${monitor_type}.${monitor._id}`]: true,
                    }
                    let update_team = {
                        [`user_monitors.${user_id}.${agent_id}.${monitor_type}.${monitor.monitor_ref}`]: true,
                        $push : { [`user_monitors_arr.${user_id}`]: monitor._id },
                        $inc : { monitor_occupancy : 1 }
                    }

                    // Step 4 : Push all updates for team.
                    await DeviceModel.updateOne(
                        {
                            _id: device_id,
                        },
                        update_device
                    );
                    await TeamModel.updateOne(
                        {
                            _id : team._id,
                        },
                        update_team
                    );
                    res.json(handle_success({
                        message : "Monitor created successfully!",
                        monitor : {...monitor.toObject(), ...remote_response}
                    }))
                } catch (err) {
                    return res.json(handle_error(err.message));
                }

            }).catch((err) => {
                return res.json(handle_error(err.message ? err.message : err))
            })
        
        })
    } catch (err) {
        res.json(handle_error(err.message));
    }
})

router.post('/dashboard/showcase', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    let test = null;
    TeamModel.findById({ 
        _id : team_id
    }, async (err, team) => {
        // Basic check
        const invalid = no_docs_or_error(team, err);
        if(invalid.is_true) return res.json(invalid.message);

        const final_response_object = {
            level_1 : {
                two_states : {
                    null : 0,
                    0 : 0,
                    1 : 0,
                },
                three_states : {
                    null : 0,
                    0 : 0,
                    1 : 0,
                    2 : 0
                }
            },

            level_2 : {
                two_states : {

                },
                three_states : {

                }
            },

            level_3 : {

            }
        }
        // Looping through all agents.
        const team_monitors = team.monitors ? team.monitors : [];
        const user_monitors = team.user_monitors.has(user_id) ? team.user_monitors.get(user_id) : [];
        
        const final_urls = []
        const fetch_urls = await AgentModel.find({
            _id : {
                $in : Array.from( team_monitors.keys() ).concat(Object.keys(user_monitors))
            }
        }).select("api_url");
        if(fetch_urls.length <= 0) return res.json(handle_success([]))
        const team_monitors_keys = Array.from(team_monitors.keys());
        // console.log(team_monitors_keys, team_monitors);
        if(team_monitors_keys.length > 0){
            for (const index in team_monitors_keys ) {
                const agent_key = team_monitors_keys[index];
                const monitor_type = team_monitors.get(team_monitors_keys[index])
            // }
            // team_monitors.forEach( async (monitor_type, agent_key) => {
                // console.log("monitor_type", monitor_type, "agent_key", agent_key)         
                // Looping through all monitor types for an agent.
                for (const monitor_type_key in monitor_type) {
                    if (Object.hasOwnProperty.call(monitor_type, monitor_type_key)) {
                        
                        //Loooping through all monitors.
                        const monitors = Object.keys(monitor_type[monitor_type_key]);
                        // console.log(monitors);
                        // axios.post(`${agent.api_url}/api/${data.type}/mutate/create`)
                        const target_agent = fetch_urls.find(obj => {
                            return obj._id == agent_key
                        });
                        // console.log("Sending axios request to : " + `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many` )
                        // console.log(monitors);
                        await axios.post(
                            `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many`,
                            {monitors}
                        ).then((response) => {
                            const resp = response.data;
                            test = resp;
                            if(resp.accomplished){
                                // console.log("API response : " ,resp.response)
                                for (const key in resp.response) {
                                    if (Object.hasOwnProperty.call(resp.response, key)) {
                                        const rec = resp.response[key];
                                        // Adding to level 1 - starts
                                        if(binary_monitors[monitor_type_key] === true){
                                            final_response_object.level_1.two_states[rec._id.monitor_status ? 0 : 1] += rec.count
                                        }else{
                                            final_response_object.level_1.three_states[rec._id.monitor_status] += rec.count
                                        }
                                        // Adding to level 1 - ends
    
                                        // Adding to level 2 - starts
                                        let device_category = null;
                                        if(binary_monitors[monitor_type_key] == true){
                                            device_category = "two_states";
                                            rec._id.monitor_status = rec._id.monitor_status ? 0 : 1;
                                        }else{
                                            device_category = "three_states";
                                        }
                                        if( final_response_object.level_2[device_category][rec._id.device] && final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] ){
                                            final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] += rec.count;
                                        }else{
                                            final_response_object.level_2[device_category][rec._id.device] = {
                                                [rec._id.monitor_status] : rec.count
                                            }
                                        }
                                        // Adding to level 2 - ends
    
                                        // Adding to level 3 - starts
                                        if( final_response_object.level_3[rec._id.device] && final_response_object.level_3[rec._id.device][rec._id.monitor_ref] ){
                                            final_response_object.level_3[rec._id.device][rec._id.monitor_ref] = {
                                                label : rec._id.label,
                                                monitor_status : rec._id.monitor_status
                                            };
                                        }else{
                                            final_response_object.level_3[rec._id.device] = {
                                                [rec._id.monitor_ref] : {
                                                    label : rec._id.label,
                                                    monitor_status : rec._id.monitor_status
                                                }
                                            }
                                        }
                                        // final_response_object.level_3[rec._id.device][rec._id.monitor_ref] = {
                                        //     label : rec._id.label,
                                        //     monitor_status : rec._id.monitor_status
                                        // };
                                        // Adding to level 3 - ends
                                    }
                                }
                            }
                        }).catch((err) => {
                            console.log(handle_error(err.message ? err.message : err))
                        })
    
                        // Add check for enabled/disabled monitors here later.
                    }
                }
                // return res.json({binaryObject, ternaryObject});
            }
        }
        if(Object.keys(user_monitors).length > 0){
            for (const agent_key in user_monitors) {
                if (Object.hasOwnProperty.call(user_monitors, agent_key)) {
                    const element = user_monitors[agent_key];
                    // Looping through all monitor types for an agent.
                    for (const monitor_type_key in element) {

                        //Loooping through all monitors.
                        console.log("monitor_type_key", monitor_type_key);
                        const monitors = Object.keys(element[monitor_type_key]);
                        // axios.post(`${agent.api_url}/api/${data.type}/mutate/create`)
                        // console.log(user_monitor_index, fetch_urls)
                        const target_agent = fetch_urls.find(obj => {
                            return obj._id == agent_key
                        });
                        if((target_agent && target_agent.api_url)){
                            console.log("Sending axios request to : " + `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many` )
                        await axios.post(
                            `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many`,
                            {monitors}
                        ).then((response) => {
                            const resp = response.data;
                            // console.log("API response : " ,response.data)
                            test = resp;
                            if(resp.accomplished){
                                for (const key in resp.response) {
                                    if (Object.hasOwnProperty.call(resp.response, key)) {
                                        const rec = resp.response[key];
                                        // Adding to level 1 - starts
                                        if(rec._id.monitor_status == "false") console.log(rec._id.monitor_status);
                                        if(binary_monitors[monitor_type_key] === true){
                                            final_response_object.level_1.two_states[rec._id.monitor_status ? 0 : 1] += rec.count
                                        }else{
                                            final_response_object.level_1.three_states[rec._id.monitor_status] += rec.count
                                        }
                                        // Adding to level 1 - ends
                                    
                                        // Adding to level 2 - starts
                                        let device_category = null;
                                        if(binary_monitors[monitor_type_key] == true){
                                            device_category = "two_states";
                                            rec._id.monitor_status = rec._id.monitor_status ? 0 : 1;
                                        }else{
                                            device_category = "three_states";
                                        }
                                        
                                        if( final_response_object.level_2[device_category][rec._id.device] && final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] ){
                                            final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] += rec.count;
                                        }else{
                                            final_response_object.level_2[device_category][rec._id.device] = {
                                                [rec._id.monitor_status] : rec.count
                                            }
                                        }
                                        // Adding to level 2 - ends
                                    
                                        // Adding to level 3 - starts
                                        if( final_response_object.level_3[rec._id.device] && final_response_object.level_3[rec._id.device][rec._id.monitor_ref] ){
                                            final_response_object.level_3[rec._id.device][rec._id.monitor_ref] = {
                                                label : rec._id.label,
                                                monitor_status : rec._id.monitor_status
                                            };
                                        }else{
                                            final_response_object.level_3[rec._id.device] = {
                                                [rec._id.monitor_ref] : {
                                                    label : rec._id.label,
                                                    monitor_status : rec._id.monitor_status
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }).catch((err) => {
                            console.log(err)
                            console.log(handle_error(err.message ? err.message : err))
                        })
                        }
                        // Add check for enabled/disabled monitors here later.
                    }
                    
                }
            }
        }
        console.log('RETURNING RESPONSE')
        return res.json(handle_success(final_response_object));
    });
})


router.post('/update/team', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_ref = data.monitor_ref;
    const monitor_id = data.monitor_id;
    const idcheck = found_invalid_ids([user_id, team_id, monitor_ref]); 
    if(idcheck.invalid){
        return res.json(idcheck.message);
    }

    TeamModel.findById({
        _id : team_id
    }).populate("agent_id").exec(async (err, team) => {
        if(!team || err){
            return res.json(handle_error("Could not retrieve valid data from database."));
        }
        let isRoot = is_root(team.root, user_id);
        if(
            !(
                isRoot || 
                (
                    team.monitoring_admins.has(user_id) && 
                    team.monitoring_admins.get(user_id) === true
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the monitor
            MonitorModel.findOne({
                _id: monitor_id,
            }).populate("agent_id").then(async (doc) => {
                if (!doc) {
                    return res.json(not_found("Monitor"))
                }
                const api = doc.agent_id.api_url
                console.log(doc.type)
                await axios.post(
                    `${api}/api/${doc.type}/mutate/update`,
                    {...data, ...{agent_id : doc.monitor_ref}}
                ).then((response) => {
                    console.log(response.data);
                    return res.json(response.data)
                })

            });
            

    });
})

router.post('/update/user', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_ref = data.monitor_ref;
    const monitor_id = data.monitor_id;
    const idcheck = found_invalid_ids([user_id, team_id, monitor_ref]); 
    if(idcheck.invalid){
        return res.json(idcheck.message);
    }

    TeamModel.findById({
        _id : team_id
    }).populate("agent_id").exec(async (err, team) => {
        if(!team || err){
            return res.json(handle_error("Could not retrieve valid data from database."));
        }
        let isRoot = is_root(team.root, user_id);
        if(
            !(
                isRoot || 
                (
                    team.monitoring_admins.has(user_id) && 
                    team.monitoring_admins.get(user_id).contains(monitor_id)
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the monitor
            MonitorModel.findOne({
                _id: monitor_id,
            }).populate("agent_id").then(async (doc) => {
                if (!doc) {
                    return res.json(not_found("Monitor"))
                }
                const api = doc.agent_id.api_url
                console.log(doc.type)
                await axios.post(
                    `${api}/api/${doc.type}/mutate/update`,
                    {...data, ...{agent_id : doc.monitor_ref}}
                ).then((response) => {
                    console.log(response.data);
                    return res.json(response.data)
                })
            });
    });
})

router.post('/enumerate/team', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    console.log(user_id, team_id);
    if( found_invalid_ids([user_id, team_id]).invalid ){
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
    if( found_invalid_ids([user_id, team_id]).invalid ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }

    TeamModel.findById({ 
        _id : team_id
    }, async (err, team) => {
        // console.log(team.user_monitors);
        if(!team || err){
            res.json(handle_error("Your team could not be identified."));
        }
        const user_monitors_object = team.user_monitors.get(user_id);
        if(!user_monitors_object) return res.json(handle_error("You haven't created any devices yet."));
        const monitors_array = team.user_monitors_arr.get(user_id);
        
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
    if( found_invalid_ids([user_id, team_id, monitor_id]).invalid ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }

    TeamModel.findById({
        _id : team_id
    }, async (err, team) => {

        if(!team || err){
            res.json(handle_error("Could not retrieve valid data from database."));
        }
    
        let isRoot = is_root(team.root, user_id);
        // if(!team.monitors.has(monitor_id)) return res.json(handle_error("Monitor not found in your Team"));
        if(
            (   
                isRoot || 
                ( team.monitor_admins.has(user_id) && team.monitor_admins[user_id] === true ) || 
                (team.assigned_monitors.has(user_id) && team.assigned_monitors[user_id][monitor_id] === true)
            )
        ){
            // Enumerate the monitor
            await MonitorModel.findById({ 
            _id : monitor_id
            })
            .populate({
                path : 'agent_id',
                select : 'api_url -_id'
            }).exec( async (err, monitor) => {
                // Call the remote agent API.
                axios.post(
                    `${monitor.agent_id.api_url}/api/${monitor.type}/fetch/view/one`, // API path
                    {agent_id : monitor.monitor_ref} // Data to be sent
                
                ).then( async response => {
                    try {
                        const remote_response = response.data;
                        NotificationTemplateModel.findById({ 
                            _id : monitor.notification_template
                        }, (err, doc) => {
                            const final_response = {
                                monitor : remote_response
                            };
                            if(doc){
                                final_response.notification_template = doc;
                            }
                            return res.json(handle_success(final_response));
                        });
                    } catch (err) {
                        return res.json(handle_error(err.message));
                    }
                
                }).catch((err) => {
                    return res.json(handle_error(err.message ? err.message : err))
                })
            })
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

    if(found_invalid_ids([user_id, team_id, monitor_id]).invalid){
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

    if(found_invalid_ids([user_id, team_id, monitor_id]).invalid){
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

function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

snmp_responses = {
    0 : "No SNMP support",
    1 : "SNMP v1",
    2 : "SNMP v2",
    3 : "SNMP v3",
}