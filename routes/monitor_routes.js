const express = require('express');
const {NodeSSH} = require('node-ssh')


const MonitorModel = require('../models/Monitor');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated, check_monitor_type, invalid_monitor_type, binary_monitors, handle_generated_error, not_found, webSocketSendJSON, webSocketRecievedJSON } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const DeviceModel = require('../models/Device');
const { default: axios } = require('axios');
const AgentModel = require('../models/Agent');
const { refreshStyles } = require('less');
const NotificationTemplateModel = require('../models/NotificationTemplate');
const router = express.Router();
// import WebSocket from 'ws';
const WebSocket = require("ws");
var ab2str = require('arraybuffer-to-string');
const { fetchWebSocket } = require('../helpers/websocket');
const { parseDashboardDataResponse } = require('../helpers/monitors')

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
        .select('api_url name private team_id')
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
            monitor_info.api_path = `/api/${monitor_info.type}/mutate/create`;
            monitor_info.api_method = 'post';

            // Add code here to check for permissions. Skipped for now.

            // Call the remote agent API to create a new monitor.
            if(agent.private == true){
                // const urlInfo = (new URL(agent.api_url));
                // domain = urlInfo.hostname.replace('www.','');
                // const webSocketPath = "ws://" + domain + ":" + urlInfo.port + "/api";
                // console.log("Web Socket path is : " + webSocketPath)
                // const ws = new WebSocket(webSocketPath);
                console.log(agent._id);
                const ws = fetchWebSocket(agent._id);
                if(!ws) return res.json(handle_error("Remote agent " + agent.name + " is not connected to the central server."));
                webSocketSendJSON(ws, monitor_info);
                ws.on("message", function incoming(response){
                    const response_json = webSocketRecievedJSON(response);
                    update_team_after_create_team_monitor(response_json);
                    
                })
            }
            else {
                axios.post(

                    `${agent.api_url}/api/${data.type}/mutate/create`, // API path
                    monitor_info // Data to be sent

                ).then( async response => {
                    update_team_after_create_team_monitor(response.data);

                }).catch((err) => {
                    console.log(err)
                    return res.json(handle_error(err.message ? err.message : err))
                })
            }
            async function update_team_after_create_team_monitor(remote_response){
                try {
                    // const remote_response = response.data;
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
                        $inc : { monitor_occupancy : 1 },
                        $push : {team_monitors_arr : monitor._id}
                    }
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
                        update_team,
                    );
                    const final_response = {...monitor.toObject(), ...remote_response};
                    final_response._id = monitor._id;
                    return res.json(handle_success({
                        message : "Monitor created successfully!",
                        monitor : final_response
                    }))
                } catch (err) {
                    console.log(err)

                }
            }
        })
    } catch (err) {
        res.json(handle_error(err.message));
        console.log(err)
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
            monitor_info.api_path = `/api/${monitor_info.type}/mutate/create`;
            monitor_info.api_method = 'post';

            // Add code here to check for permissions. Skipped for now.

            // Call the remote agent API to create a new monitor.

            if(agent.private == true){
                // const urlInfo = (new URL(agent.api_url));
                // domain = urlInfo.hostname.replace('www.','');
                // const webSocketPath = "ws://" + domain + ":" + urlInfo.port + "/api";
                // console.log("Web Socket path is : " + webSocketPath)
                // const ws = new WebSocket(webSocketPath);
                // console.log(agent._id);
                const ws = fetchWebSocket(agent._id);
                if(!ws) return res.json(handle_error("Remote agent " + agent.name + " is not connected to the central server."));
                webSocketSendJSON(ws, monitor_info);
                ws.on("message", function incoming(response){
                    const response_json = webSocketRecievedJSON(response);
                    update_team_after_create_user_monitor(response_json);
                    
                })
            }else{
                axios.post(

                    `${agent.api_url}/api/${data.type}/mutate/create`, // API path
                    monitor_info // Data to be sent
    
                ).then( async response => {
                    update_team_after_create_user_monitor(response.data);
    
                }).catch((err) => {
                    return res.json(handle_error(err.message ? err.message : err))
                })
            }

            

            async function update_team_after_create_user_monitor(remote_response){
                try {
                    // const remote_response = response.data;
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
                    const final_response = {...monitor.toObject(), ...remote_response};
                    final_response._id = monitor._id;
                    return res.json(handle_success({
                        message : "Monitor created successfully!",
                        monitor : final_response
                    }))
                } catch (err) {
                    console.log(err);
                }
            }
        
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
        }).select("api_url private");
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
                        console.log("CURRENT PRIVATE STATUS IS : ", target_agent.private )
                        if(target_agent.private){
                            const ws = fetchWebSocket(target_agent._id);
                            webSocketSendJSON(ws, {
                                monitors,
                                api_method : 'post',
                                api_path : `/api/${monitor_type_key}/fetch/view/many`
                            });
                            await ws.on("message", function incoming(response){
                                const response_json = webSocketRecievedJSON(response);
                                console.log(response_json)
                                parseDashboardDataResponse(response_json, final_response_object, monitor_type_key);
                            })
                        }else{
                            console.log("Sending axios request to : " + `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many` )
                            await axios.post(
                                `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many`,
                                {monitors}
                            ).then((response) => {
                                const resp = response.data;
                                parseDashboardDataResponse(resp, final_response_object, monitor_type_key);
                            }).catch((err) => {
                                console.log(handle_error(err.message ? err.message : err))
                            })
                        }
                        
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
                        console.log("CURRENT PRIVATE STATUS IS : ", target_agent.private, target_agent._id )
                        if(target_agent.private){
                            const ws = fetchWebSocket(target_agent._id);
                            if(ws){
                                webSocketSendJSON(ws, {
                                    monitors,
                                    api_method : 'post',
                                    api_path : `/api/${monitor_type_key}/fetch/view/many`
                                });
                                await ws.on("message", function incoming(response){
                                const response_json = webSocketRecievedJSON(response);
                                console.log(response_json)
                                parseDashboardDataResponse(response_json, final_response_object, monitor_type_key);
                            })
                            }
                        }else{
                            console.log("Sending axios request to : " + `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many` )
                            await axios.post(
                                `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many`,
                                {monitors}
                            ).then((response) => {
                                const resp = response.data;
                                parseDashboardDataResponse(resp, final_response_object, monitor_type_key);
                            }).catch((err) => {
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
                const sendData = {...data, ...{agent_id : doc.monitor_ref}};
                sendData.api_path = `/api/${doc.type}/mutate/update`;
                sendData.api_method = "post";

                const ws = fetchWebSocket(doc.agent_id._id);
                if(ws){
                    webSocketSendJSON(ws, sendData);
                    ws.on("message", function incoming(response){
                        const response_json = webSocketRecievedJSON(response);
                        return res.json(response_json);
                    })
                }else{
                    await axios.post(
                        `${api}/api/${doc.type}/mutate/update`,
                        sendData
                    ).then((response) => {
                        console.log(response.data);
                        return res.json(response.data)
                    })
                }
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
        // let isRoot = is_root(team.root, user_id);
        // if(
        //     !(
        //         isRoot || 
        //         (
        //             team.monitoring_admins.has(user_id) && 
        //             team.monitoring_admins.get(user_id).contains(monitor_id)
        //         )
        //     )
        // ){
        //     return res.json(not_authenticated);
        // }
            //Update the monitor
            MonitorModel.findOne({
                _id: monitor_id,
            }).populate("agent_id").then(async (doc) => {
                if (!doc) {
                    return res.json(not_found("Monitor"))
                }
                const api = doc.agent_id.api_url
                const sendData = {...data, ...{agent_id : doc.monitor_ref}};
                sendData.api_path = `/api/${doc.type}/mutate/update`;
                sendData.api_method = "post";

                const ws = fetchWebSocket(doc.agent_id._id);
                if(ws){
                    webSocketSendJSON(ws, sendData);
                    ws.on("message", function incoming(response){
                        const response_json = webSocketRecievedJSON(response);
                        return res.json(response_json);
                    })
                }else{
                    await axios.post(
                        `${api}/api/${doc.type}/mutate/update`,
                        {...data, ...{agent_id : doc.monitor_ref}}
                    ).then((response) => {
                        console.log(response.data);
                        return res.json(response.data)
                    })
                }
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
        // if(
        //     (   
        //         isRoot || 
        //         ( team.monitor_admins.has(user_id) && team.monitor_admins[user_id] === true ) || 
        //         (team.assigned_monitors.has(user_id) && team.assigned_monitors[user_id][monitor_id] === true)
        //     )
        // ){
            // Enumerate the monitor
            await MonitorModel.findById({ 
            _id : monitor_id
            })
            .populate({
                path : 'agent_id',
                select : 'api_url -_id'
            }).exec( async (err, monitor) => {
                // Call the remote agent API.
                const sendData = {};
                sendData.api_path = `${monitor.agent_id.api_url}/api/${monitor.type}/fetch/view/one`;
                sendData.api_method = "post";
                sendData.agent_id = monitor.monitor_ref;

                const ws = fetchWebSocket(monitor.agent_id._id);
                if(ws){
                    webSocketSendJSON(ws, sendData);
                    ws.on("message", function incoming(response){
                        const response_json = webSocketRecievedJSON(response);
                        return res.json(response_json);
                    })
                }else{
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
                }
                
            })
        // }else{
        //     return res.json(handle_error("You're not authenticated to perform this operation."));
        // }

    });
})



router.post('/delete/team', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        const monitor_id = data.monitor_id;
        if(found_invalid_ids([user_id, monitor_id]).invalid){
            return res.json(handle_error("The given User ID is not valid."));
        }

        MonitorModel.findOne({
            _id : monitor_id,
        }).populate("agent_id").exec(async (err, monitor) => {
            if(err) return res.json(handle_generated_error(err))
            if (!monitor) {
                return res.json(not_found("Monitor"));
            }
            const agent = monitor.agent_id
            const monitor_type = monitor.type;

            const sendData = {
                user_id : user_id,
                agent_id : monitor.monitor_ref
            };
            sendData.api_path = `${agent.api_url}/api/${monitor.type}/mutate/delete`;
            sendData.api_method = "post";
            const ws = fetchWebSocket(monitor.agent_id._id);
            if(ws){
                console.log("Here");
                webSocketSendJSON(ws, sendData);
                ws.on("message", function incoming(response){
                    const response_json = webSocketRecievedJSON(response);
                    console.log(response_json)
                    delete_monitor_in_team(response_json);
                })
            }else{
                axios.post(
                    sendData.api_path, // API path
                    sendData // Data to be sent
    
                ).then( async response => {
                    delete_monitor_in_team(response.data);
    
                }).catch((err) => {
                    console.log(err)
                    return res.json(handle_error(err.message ? err.message : err))
                })
            }

            function delete_monitor_in_team(remote_response){
                try {
                    // const remote_response = response.data;
                    // If monitor could not be created.
                    if(!remote_response.accomplished) return res.json(remote_response);

                    MonitorModel.findOneAndDelete({
                        _id: monitor_id
                    }, async (err, doc) => {
                        if(err){
                            return res.json(handle_generated_error(err));
                        }
                        if(!doc){
                            return res.json(not_found("Monitor to be deleted"));
                        }

                         // Step 3 : Set update info
                        let update_device = {
                            $unset : {
                                [`monitors.${agent._id}.${monitor_type}.${monitor._id}`]: true,
                            }
                        }
                        let update_team = {
                            $unset : {
                                [`monitors.${agent._id}.${monitor_type}.${monitor.monitor_ref}`]: true,
                            },
                            // [`user_monitors.${user_id}.${monitor._id}`]: true,
                            $inc : { monitor_occupancy : -1 }
                        }
                    
                        // Step 4 : Push all updates for team.
                        await DeviceModel.updateOne(
                            {
                                _id: monitor.device_id,
                            },
                            update_device
                        );
                        await TeamModel.updateOne(
                            {
                                _id : team_id,
                            },
                            update_team
                        );
                        return res.json(handle_success({
                            message : "Monitor deleted successfully!",
                            monitor : {...monitor.toObject(), ...remote_response}
                        }))

                        });
                    
                } catch (err) {
                    return res.json(handle_error(err.message));
                }
            }
        });
    } catch (err) {
        console.log(err)
        res.json(handle_error(err.message));
    }
})


router.post('/delete/user', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        const monitor_id = data.monitor_id;
        if(found_invalid_ids([user_id, monitor_id]).invalid){
            return res.json(handle_error("The given User ID is not valid."));
        }

        MonitorModel.findOne({
            _id : monitor_id,
        }).populate("agent_id").exec(async (err, monitor) => {
            if(err) return res.json(handle_generated_error(err))
            if (!monitor) {
                return res.json(not_found("Monitor"));
            }
            const agent = monitor.agent_id;
            const monitor_type = monitor.type;

            const sendData = {
                user_id : user_id,
                agent_id : monitor.monitor_ref
            };
            sendData.api_path = `${agent.api_url}/api/${monitor.type}/mutate/delete`;
            sendData.api_method = "post";
            const ws = fetchWebSocket(monitor.agent_id._id);
            if(ws){
                webSocketSendJSON(ws, sendData);
                ws.on("message", function incoming(response){
                    const response_json = webSocketRecievedJSON(response);
                    delete_monitor_in_user(response_json);
                })
            }else{
                axios.post(
                    sendData.api_path, // API path
                    {
                        user_id : user_id,
                        agent_id : monitor.monitor_ref
                    } // Data to be sent
    
                ).then( async response => {
                    delete_monitor_in_user(response.data);
    
                }).catch((err) => {
                    console.log(err)
                    return res.json(handle_error(err.message ? err.message : err))
                })
            }
            

            function delete_monitor_in_user(remote_response){
                try {
                    // const remote_response = response.data;
                    // If monitor could not be created.
                    if(!remote_response.accomplished) return res.json(remote_response);

                    MonitorModel.findOneAndDelete({ 
                        _id: monitor_id
                    }, async (err, doc) => {
                        if(err){
                            return res.json(handle_generated_error(err));
                        } 
                        if(!doc){
                            return res.json(not_found("Monitor to be deleted"));
                        }

                        // Step 3 : Set update info
                        let update_device = {
                            [`monitors.${agent._id}.${monitor_type}.${monitor._id}`]: true,
                        }
                        let update_team = {
                            [`user_monitors.${user_id}.${agent._id}.${monitor_type}.${monitor.monitor_ref}`]: true,
                            $push : { [`user_monitors_arr.${user_id}`]: monitor._id },
                            $inc : { monitor_occupancy : 1 }
                        }

                        // Step 4 : Push all updates for team.
                        await DeviceModel.updateOne(
                            {
                                _id: monitor.device_id,
                            },
                            update_device
                        );
                        await TeamModel.updateOne(
                            {
                                _id : team_id,
                            },
                            update_team
                        );
                        const final_response = {...monitor.toObject(), ...remote_response};
                        final_response._id = monitor._id;
                        return res.json(handle_success({
                            message : "Monitor deleted successfully!",
                            monitor : {...monitor.toObject(), ...remote_response}
                        }))

                        });
                    
                } catch (err) {
                    return res.json(handle_error(err.message));
                }
            }
        });
    } catch (err) {
        console.log(err)
        res.json(handle_error(err.message));
    }
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