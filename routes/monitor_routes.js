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
const { parseDashboardDataResponse, parseDashboardDataResponseV2 } = require('../helpers/monitors')

const ssh = new NodeSSH()

router.post('/create/team', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_id = data.device_id;
        let agent_id = data.agent_id;
        let team_id = data.team_id;
        const monitor_type = data.type;
        const invalidCheck = found_invalid_ids([user_id, device_id, agent_id], res);
        if(invalidCheck.invalid){
            return res.json(handle_error(invalidCheck.message));
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
            if(err) return res.json(handle_generated_error(err));
        if(!team) return res.json(not_found("Agent"));

            // Populated declarations.
            // const team = agent.team_id;
            const team = TeamModel.findById({_id : team_id});
            if(!team) return not_found("Team");
            
            // Check for vacancy.
            if(team.monitor_occupancy >= get_capacity(team.level).monitors) return res.json(handle_error("Max monitors limit exceeded."));

            // Fetch and store device info.
            const device = await DeviceModel.findById({ _id : device_id }).select('-_id creds');
            if(!device) return res.json(handle_error("Device not found."));
            const monitor_info = { ...data, ...(device.creds) };
            monitor_info.api_path = `/api/${monitor_info.type}/mutate/create`;
            monitor_info.api_method = 'post';
            monitor_info.fromTeam = true;
            monitor_info.creator = user_id;

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

                const response_json = await webSocketSendJSON(ws, monitor_info);
                update_team_after_create_team_monitor(response_json);
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
                    const monitor = await MonitorModel.create({...monitor_info, ...{monitor_ref : remote_response.agent_id, monitor_type : monitor_type}});
                    if(!monitor) return res.json(handle_error("Monitor was created sucessfully, but could not be added to the central database."));

                    // Step 3 : Set update info
                    let update_device = {
                        [`monitors.${agent_id}.${monitor_type}.${monitor._id}`]: true,
                    }
                    let update_team = {
                        [`monitors.${agent_id}.${monitor_type}.${monitor.monitor_ref}`]: true,
                        // [`user_monitors.${user_id}.${monitor._id}`]: true,
                        $inc : { monitor_occupancy : 1 },
                        $push : {team_monitors_arr : monitor._id},
                        ...(Array.isArray(data.assigned_users) && data.assigned_users.length > 0) && {
                            [`assigned_monitors.${monitor._id}`] : [... new Set(data.assigned_users) , ... new Set(team.assigned_users)]
                        }
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
                    if(Array.isArray(data.assigned_users) && data.assigned_users.length > 0){
                        res.runMiddleware('/monitors/assign/add', {method : 'post'}, (code, data) => {
                            console.log(code, data);
                        })
                    }
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

router.post('/lite/create', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_id = data.device_id;
        let team_id = data.team_id;
        const monitor_type = data.type;
        console.log(data.type, check_monitor_type(data.type))
        if(!check_monitor_type(data.type)) return res.json(invalid_monitor_type());
        
        const monitor = await MonitorModel.create(data);
        if(!monitor) return res.json(handle_error("Monitor could not be created."))
        // Step 3 : Set update info

        let update_device = {
            [`monitors.lite.${monitor_type}.${monitor._id}`]: true,
        }
        let update_team = {
            // [`user_monitors.${user_id}.${agent_id}.${monitor_type}.${monitor.monitor_ref}`]: true,
            $push : { [`user_monitors_arr.${user_id}`]: monitor._id },
            $inc : { monitor_occupancy : 1 },
        }

        await DeviceModel.updateOne(
            {
                _id: device_id,
            },
            update_device
        );
        await TeamModel.updateOne(
            {
                _id : team_id,
            },
            update_team,
        );
        return res.json(handle_success({
            message : "Monitor created successfully!",
            monitor : monitor
        }))
        
    } catch (err) {
        res.json(handle_error(err.message ? err.message : err));
        console.log(err)
    }
})

router.post('/lite/update', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        let monitor_id = data.monitor_id;
        
        MonitorModel.findOneAndUpdate({
            _id: monitor_id,
        }, 
        data,
        {new : true},
        (err, monitor) => {
            if (err) return res.json(handle_generated_error(err))
            return res.json(handle_success(monitor))
        });
        
    } catch (err) {
        res.json(handle_error(err.message ? err.message : err));
        console.log(err)
    }
})

router.post('/lite/enumerate', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        let monitor_id = data.monitor_id;
        
        MonitorModel.findById({ 
            _id: monitor_id
        }, (err, monitor) => {
            if (err) return res.json(handle_generated_error(err))
            return res.json(handle_success(monitor))
        });
    } catch (err) {
        res.json(handle_error(err.message ? err.message : err));
        console.log(err)
    }
})

router.post('/lite/delete', async (req, res, next) => {
    try {
        const data = req.body;
        let user_id = data.user_id;
        let team_id = data.team_id;
        let monitor_id = data.monitor_id;
        
        MonitorModel.findOneAndDelete({
            _id: monitor_id,
        }, 
        async (err, monitor) => {
            if (err) return res.json(handle_generated_error(err))

            let update_device = {
                $unset : {
                    [`monitors.lite.${data.type}.${monitor._id}`]: 1,
                }
                // [`monitors.${agent._id}.${monitor_type}.${monitor._id}`]: true,
            }

            let update_team = {
                // $unset : {
                //     [`user_monitors.${user_id}.${agent._id}.${monitor_type}.${monitor.monitor_ref}`]: 1,
                // },
                $pull : { 
                    [`user_monitors_arr.${user_id}`]: monitor._id
                 },
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
            return res.json(handle_success("Monitor deleted successfully."))
        });
    } catch (err) {
        res.json(handle_error(err.message ? err.message : err));
        console.log(err)
    }
})

router.post('/assign/add', async (req, res, next) => {
    console.log("Adding monitor admins...")
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;
    const users = data.users;

    if(!(Array.isArray(users) && users.length > 0)){
        return res.json(handle_error("Invalid/Empty monitors array."));
    }

    MonitorModel.findOneAndUpdate({
        _id: monitor_id,
    }, {
        $addToSet : {
            assigned_users : {
                $each : users
            }
        }
    },
    { new : true },
    (err, monitor) => {
        if(err) return res.json(handle_generated_error(err));
        if(!monitor) return res.json(handle_error(not_found("Monitor")));

        const users_obj = {};
        users.forEach((user) => users_obj[`assigned_monitors_users.${user}`] = monitor_id)

        TeamModel.findOneAndUpdate({
            _id: team_id,
        }, {
            $addToSet : {
                [`assigned_monitors.${monitor_id}`]: {
                    $each : users
                },
                ...users_obj
            },
        }, (err, team) => {
            if(err) return res.json(handle_generated_error(err))
            if(!team) return res.json(handle_error(not_found("Team")))

            return res.json(handle_success(monitor));
        });
    });
})

router.post('/assign/remove', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;
    const users = data.users;

    if(!(Array.isArray(users) && users.length > 0)){
        return res.json(handle_error("Invalid/Empty monitors array."));
    }

    MonitorModel.findOneAndUpdate({
        _id: monitor_id,
    }, {
        $pull : {
            assigned_users : {
                $in : users
            }
        }
    },
    { new : true },
    (err, monitor) => {
        if(err) return res.json(handle_generated_error(err));
        if(!monitor) return res.json(handle_error(not_found("Monitor")));

        const users_obj = {};
        users.forEach((user) => users_obj[`assigned_monitors_users.${user}`] = monitor_id)

        TeamModel.findOneAndUpdate({
            _id: team_id,
        }, {
            $pull : {
                [`assigned_monitors.${monitor_id}`]: {
                    $in : users
                },
                ...users_obj
            },
        }, (err, team) => {
            if(err) return res.json(handle_generated_error(err))
            if(!team) return res.json(handle_error(not_found("Team")))

            return res.json(handle_success(monitor));
        });
    });
})

router.post('/assign/enumerate', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;

    TeamModel.findById({
        _id : team_id
    }, async (err, team) => {
      if(err) return res.json(handle_generated_error(err))
      if(!team) return res.json(not_found("Team"));

      const assigned_monitors_arr = Array.from(team.assigned_monitors.keys())
      console.log(assigned_monitors_arr)
      await MonitorModel.find({ 
          _id : {
              $in : assigned_monitors_arr
          }
      })
      .select("label type monitor_ref")
      .exec((err, monitors) => {
        if(err){
          console.log(err)
          return res.json(handle_generated_error(err))
        }
      return res.json(handle_success(monitors));
    });
      

    });
})

router.post('/assign/enumerate/monitor', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const monitor_id = data.monitor_id;

    MonitorModel.findById({ 
        _id : monitor_id
    })
    .populate("assigned_users", "email name") 
    .exec((err, monitor) => {
        if(err) return res.json(handle_generated_error(err))
        if(!monitor) return res.json(not_found("Monitor"));

        return  res.json(handle_success({ assigned_users : monitor.assigned_users }));
    })
})

router.post('/assign/enumerate/user', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;

    TeamModel.findById({ 
        _id : team_id
    }, (err, team) => {
        if(err) {console.log(err); return res.json(handle_generated_error(err))};
        if(!team) return res.json(not_found("Team"))

        const monitors = team.assigned_monitors_users.has(user_id) ? team.assigned_monitors_users.get(user_id) : [];
        // console.log(team.assigned_monitors_users, monitors, user_id)
        if(monitors && monitors.length > 0){
            MonitorModel.find({ 
                _id: {
                    $in : monitors
                }
            })
            .select("type label monitor_ref")
            .exec((err, monitors) => {
                if(err) { console.log(err); return res.json(handle_generated_error(err))}
                return res.json(handle_success(monitors));
            });
        }else{
            return res.json(handle_success([]))
        }
    });
})

router.post('/create/user', async (req, res, next) => {
    console.log("Creating a user monitor.")
    try {
        const data = req.body;
        let user_id = data.user_id;
        let device_id = data.device_id;
        let agent_id = data.agent_id;
        let team_id = data.team_id;
        const monitor_type = data.type;
        if(!check_monitor_type(monitor_type)) return res.json(invalid_monitor_type());
        console.log(agent_id)
        AgentModel.findById({
            _id : agent_id
        })
        .populate({
            path : 'team_id',
            select : 'monitor_occupancy level'
        })
        .exec(async (err, agent) => {
            // Check if valid response returned.
            console.log(agent, err)
            const invalid = no_docs_or_error(agent, err);
            if(invalid.is_true) return res.json(invalid.message);

            // Populated declarations.
            // const team = agent.team_id;
            const team = await TeamModel.findById({_id : team_id});
            if(!team) return res.json(not_found("Team"))

            // Check for vacancy.
            if(team.monitor_occupancy >= get_capacity(team.level).monitors) return res.json(handle_error("Max monitors limit exceeded."));

            // Fetch and store device info.
            const device = await DeviceModel.findById({ _id : device_id }).select('-_id creds');
            if(!device) return res.json(handle_error("Device not found."));
            const monitor_info = { ...data, ...(device.creds) };
            monitor_info.api_path = `/api/${monitor_info.type}/mutate/create`;
            monitor_info.api_method = 'post';
            monitor_info.fromTeam = true;
            monitor_info.creator = user_id;

            // Add code here to check for permissions. Skipped for now.

            // Call the remote agent API to create a new monitor.
            console.log("Is agent private : ", agent.private)
            if(agent.private == true){
                // const urlInfo = (new URL(agent.api_url));
                // domain = urlInfo.hostname.replace('www.','');
                // const webSocketPath = "ws://" + domain + ":" + urlInfo.port + "/api";
                // console.log("Web Socket path is : " + webSocketPath)
                // const ws = new WebSocket(webSocketPath);
                // console.log(agent._id);
                const ws = fetchWebSocket(agent._id);

                if(!ws) return res.json(handle_error("Remote agent " + agent.name + " is not connected to the central server."));
                
                const response_json = await webSocketSendJSON(ws, monitor_info);
                console.log(response_json)
                update_team_after_create_user_monitor(response_json);
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
                    const monitor = await MonitorModel.create({...monitor_info, ...{monitor_ref : remote_response.agent_id, monitor_type : monitor_type}});
                    if(!monitor) return res.json(handle_error("Monitor was created sucessfully, but could not be added to the central database."));

                    // Step 3 : Set update info
                    let update_device = {
                        [`monitors.${agent_id}.${monitor_type}.${monitor._id}`]: true,
                    }
                    let update_team = {
                        [`user_monitors.${user_id}.${agent_id}.${monitor_type}.${monitor.monitor_ref}`]: true,
                        $push : { [`user_monitors_arr.${user_id}`]: monitor._id },
                        $inc : { monitor_occupancy : 1 },
                        ...(Array.isArray(data.assigned_users) && data.assigned_users.length > 0) && {
                            [`assigned_monitors.${monitor._id}`] : [... new Set(data.assigned_users) , ... new Set(team.assigned_users)]
                        }
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
                        update_team,
                        (err) => {
                          if(err) console.log(err);
                        }
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
        console.log(team.monitors, team.user_monitors)
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
                            if(ws){
                                const response_json = await webSocketSendJSON(ws, {
                                    monitors,
                                    api_method : 'post',
                                    api_path : `/api/${monitor_type_key}/fetch/view/many`
                                });
                                console.log(response_json)
                                parseDashboardDataResponse(response_json, final_response_object, monitor_type_key);
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
                        const monitors = Object.keys(element[monitor_type_key]);
                        if(monitors.length === 0) continue;
                        console.log("monitor_type_key : ", monitor_type_key);
                        // axios.post(`${agent.api_url}/api/${data.type}/mutate/create`)
                        // console.log(user_monitor_index, fetch_urls)
                        const target_agent = fetch_urls.find(obj => {
                            return obj._id == agent_key
                        });
                        console.log(target_agent.private, target_agent._id )
                        if(target_agent.private){
                            const ws = fetchWebSocket(target_agent._id);
                            console.log("Websocket for this agent" + (ws ? "found" : "not found"))
                            if(ws){
                                const response_json = await webSocketSendJSON(ws, {
                                    monitors,
                                    api_method : 'post',
                                    api_path : `/api/${monitor_type_key}/fetch/view/many`
                                });
                                console.log(response_json)
                                parseDashboardDataResponse(response_json, final_response_object, monitor_type_key);
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

router.post('/dashboard/showcase/v2', (req, res, next) => {
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
                two_states : {

                },
                three_states : {

                }
            }
        }
        // Looping through all agents.
        const team_monitors = team.monitors ? team.monitors : [];
        const user_monitors = team.user_monitors.has(user_id) ? team.user_monitors.get(user_id) : [];
        console.log(team.monitors, team.user_monitors)
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
                            if(ws){
                                const response_json = await webSocketSendJSON(ws, {
                                    monitors,
                                    api_method : 'post',
                                    api_path : `/api/${monitor_type_key}/fetch/view/many`
                                });
                                console.log(response_json)
                                parseDashboardDataResponseV2(response_json, final_response_object, monitor_type_key);
                            }
                        }else{
                            console.log("Sending axios request to : " + `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many` )
                            axios.post(
                                `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many`,
                                {monitors}
                            ).then((response) => {
                                console.log(response)
                                const resp = response.data;
                                parseDashboardDataResponseV2(resp, final_response_object, monitor_type_key);
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
                        const monitors = Object.keys(element[monitor_type_key]);
                        if(monitors.length === 0) continue;
                        console.log("Monitor type key : ", monitor_type_key);
                        // axios.post(`${agent.api_url}/api/${data.type}/mutate/create`)
                        // console.log(user_monitor_index, fetch_urls)
                        const target_agent = fetch_urls.find(obj => {
                            return obj._id == agent_key
                        });
                        console.log(target_agent.private, target_agent._id )
                        if(target_agent.private){
                            const ws = fetchWebSocket(target_agent._id);
                            console.log("Websocket for this agent : " + (ws ? "found" : "not found"))
                            if(ws){
                                const response_json = await webSocketSendJSON(ws, {
                                    monitors,
                                    api_method : 'post',
                                    api_path : `/api/${monitor_type_key}/fetch/view/many`
                                });
                                // console.log(response_json)
                                parseDashboardDataResponseV2(response_json, final_response_object, monitor_type_key);
                            }
                        }else{
                            console.log("Sending axios request to : " + `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many` )
                            await axios.post(
                                `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many`,
                                {monitors}
                            ).then((response) => {
                                // console.log(response.data)
                                // console.log(response.data.response[0]._id)
                                const resp = response.data;
                                parseDashboardDataResponseV2(resp, final_response_object, monitor_type_key);
                            }).catch((err) => {
                                console.log(handle_error(err.message ? err.message : err))
                            })
                        }
                        // Add check for enabled/disabled monitors here later.
                    }
                    
                }
            }
        }
        return res.json(handle_success(final_response_object));
    });
})

router.post('/dashboard/calibrate', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;

    TeamModel.findById({ 
        _id : team_id
    }, async (err, team) => {
        // Basic check
        const invalid = no_docs_or_error(team, err);
        if(invalid.is_true) return res.json(invalid.message);

        UserModel.findById({ 
            _id : user_id
        }, (err, user) => {
            if(err){
                return res.json(handle_generated_error(err));
            }

            if(!user) return res.json(not_found("User"));

            const monitors_arr = [];
            const metadata_map = {};
            const dashboard = user.dashboard_level_3;
            
            for (const state_key in dashboard) {
                if (Object.hasOwnProperty.call(dashboard, state_key)) {
                    const devices = dashboard[state_key];
                    for (const device_id in devices) {
                        if (Object.hasOwnProperty.call(devices, device_id)) {
                            const monitors = devices[device_id];
                            for (const monitor_ref in monitors) {
                                if (Object.hasOwnProperty.call(monitors, monitor_ref)) {
                                    console.log(`${state_key} | ${device_id} | ${monitor_ref}`)
                                    
                                    monitors_arr.push(monitor_ref);
                                    metadata_map[monitor_ref] = `dashboard_level_3.${state_key}.${device_id}.${monitor_ref}`
                                }
                            }
                        }
                    }
                }
            }
            MonitorModel.find({ 
                monitor_ref : { $in : monitors_arr}
            },
            'monitor_ref', 
            (err, valid_monitors) => {
                if (err) {
                    return res.json(handle_generated_error(err))
                }
                if(!valid_monitors) return res.json(not_found("Monitors"));
                const valid_monitors_arr = [];
                valid_monitors.forEach((monitor) => {
                    valid_monitors_arr.push(monitor.monitor_ref)
                })
                const purge_invalids = {}
                for (const state_key in dashboard) {
                    if (Object.hasOwnProperty.call(dashboard, state_key)) {
                        const devices = dashboard[state_key];
                        for (const device_id in devices) {
                            if (Object.hasOwnProperty.call(devices, device_id)) {
                                const monitors = devices[device_id];
                                for (const monitor_ref in monitors) {
                                    if (Object.hasOwnProperty.call(monitors, monitor_ref)) {
                                        
                                        if(!valid_monitors_arr.includes(monitor_ref)){
                                            purge_invalids[metadata_map[monitor_ref]] = 1;
                                        }

                                    }
                                }
                            }
                        }
                    }
                }
                UserModel.findOneAndUpdate({
                    _id: user_id,
                }, {
                    $unset : purge_invalids
                }, (err, user) => {
                    if (err) {
                        return res.json(handle_generated_error(err))
                    }
                    return res.json(handle_success({
                        message : "Dashboard calibrated successfully!",
                    }))
                });
            });
        });
    });
})


router.post('/dashboard/showcase/v3', (req, res, next) => {
  const data = req.body;
  if(!data.user_id) return res.json("No User ID given.")
  UserModel.findOne({
      _id: data.user_id,
  }).then( async (user) => {
        if (!user) {
            return res.json(not_found("User"))
        }
        const response = {
            level_1 : {
                two_states : {
                    null : 0,
                    0 : 0,
                    1 : 0,
                    // -1 : 0,
                },
                three_states : {
                    null : 0,
                    0 : 0,
                    1 : 0,
                    // -1 : 0,
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
                two_states : {

                },
                three_states : {

                }
            }
        }
        let obtained_devices = [];
        let devices_map = {};
        // Collecting device ids
        for (const type in user.dashboard_level_3) {
            if (Object.hasOwnProperty.call(user.dashboard_level_3, type)) {
                let devices = user.dashboard_level_3[type];
                if(devices){
                    devices = Object.keys(devices);
                    obtained_devices = obtained_devices.concat(devices);
                }
            }
        }
        if(obtained_devices.length === 0) return res.json(handle_success(response))
        console.log(obtained_devices)
        // Fetching device names
        await DeviceModel.find({ 
            _id: { $in : obtained_devices }
        },
        'name', 
        (err, returned_devices) => {
            if(err){
                return res.json(handle_generated_error(err));
            }
            if(returned_devices.length === 0){
                return res.json(not_found("Devices"));         
            }
            returned_devices.forEach((device) => {
                devices_map[device._id] = device.name;
            })

            // Parse all three level from level 3 dashboard :
        // console.log(user.dashboard_level_3)
        for (const type in user.dashboard_level_3) {
            if (Object.hasOwnProperty.call(user.dashboard_level_3, type)) {
                const devices = user.dashboard_level_3[type];
                for (const device_id in devices) {
                    if (Object.hasOwnProperty.call(devices, device_id)) {
                        const monitors = devices[device_id];
                        console.log(device_id, devices_map[device_id])
                        const device = devices_map[device_id]
                        for (const monitor_ref in monitors) {
                            if (Object.hasOwnProperty.call(monitors, monitor_ref)) {
                                const monitor = monitors[monitor_ref];
                                
                                
                                // Here we have all three fields available, device_id, monitor_ref, status.

                                response.level_1[type][monitor.monitor_status] += 1

                                if(!response.level_2[type].hasOwnProperty(device)){
                                    response.level_2[type][device] = {
                                        null : 0,
                                        0 : 0,
                                        1 : 0,
                                        // -1 : 0,
                                        ...(type == "three_states") && {2 : 0}
                                    }
                                }
                                response.level_2[type][device][monitor.monitor_status] += 1;

                                if(!response.level_3[type].hasOwnProperty(device)){
                                    response.level_3[type][device] = {}
                                }
                                response.level_3[type][device][monitor_ref] = monitor
                            }
                        }
                    }
                }
            }
        }

        // Adding data to level 2 response
        
        return res.json(handle_success(response))

        });

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
        if(err) return res.json(handle_generated_error(err));
        if(!team) return res.json(not_found("Team"));
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

                MonitorModel.findOneAndUpdate({
                    _id: monitor_id,
                },
                data,
                {new : true},
                (err, doc) => {
                    if (err) {
                        console.log(`Monitor metadata update error: ` + err)
                    }
                });

                const ws = fetchWebSocket(doc.agent_id._id);
                if(ws){
                    const response_json = await webSocketSendJSON(ws, sendData);
                    return res.json(response_json);
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
        if(err) return res.json(handle_generated_error(err));
        if(!team) return res.json(not_found("Team"));
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
                MonitorModel.findOneAndUpdate({
                    _id: monitor_id,
                },
                data,
                {new : true},
                (err, doc) => {
                    if (err) {
                        console.log(`Monitor metadata update error: ` + err)
                    }
                });
                const ws = fetchWebSocket(doc.agent_id._id);
                if(ws){
                    const response_json = await webSocketSendJSON(ws, sendData);
                    return res.json(response_json);
                    
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
    const monitor_ref = data.monitor_ref;

    if(!monitor_id && !monitor_ref) return res.json(handle_error("No identifiers provided"));
    if( found_invalid_ids([user_id, team_id, monitor_id]).invalid ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }

    TeamModel.findById({
        _id : team_id
    }, async (err, team) => {

        if(!team) return res.json(not_found("Team"));
        if(err) return res.json(handle_generated_error(err))
    
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

            // Model.findOne({
            //     field: filter,
            // }).then((doc) => {
            //     if (!doc) {
            //         console.log("message")
            //     } else{
                    
            //     }
            // });
            await MonitorModel.findOne({ 
            ...(monitor_id) && {_id : monitor_id},
            ...(monitor_ref) && {monitor_ref : monitor_ref}
            })
            .populate("agent_id").exec( async (err, monitor) => {
                // Call the remote agent API.
                if(err) return res.json(handle_generated_error(err));
                if(!monitor) return res.json(not_found("Monitor"));
                const sendData = {};
                sendData.api_path = `/api/${monitor.type}/fetch/view/one`;
                sendData.api_method = "post";
                sendData.agent_id = monitor.monitor_ref;
                console.log(monitor)
                if(monitor.agent_id.private){
                    const ws = fetchWebSocket(monitor.agent_id._id);
                    if(ws){
                        const response_json = await webSocketSendJSON(ws, sendData);
                        NotificationTemplateModel.findById({ 
                            _id : monitor.notification_template
                        }, (err, doc) => {
                            if(err) console.log(err);
                            const final_response = {
                                monitor : response_json,
                            };
                            if(doc){
                                final_response.notification_template = doc;
                            }
                            if(monitor){
                                final_response.metadata = monitor;
                            }
                            return res.json(handle_success(final_response));
                        });
                        // return res.json(response_json);
                    }else{
                        return res.json(handle_error({
                            message : "Remote agent is not accessible.",
                            metadata : monitor
                        }))
                    }
                }
                else{
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
                                if(monitor){
                                    final_response.metadata = monitor;
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
                sendData.api_path = `/api/${monitor.type}/mutate/delete`;
                const response_json = await webSocketSendJSON(ws, sendData);
                delete_monitor_in_team(response_json);
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
                        TeamModel.findOneAndUpdate({
                            _id: team_id,
                        },
                        update_team, 
                        (err, team) => {
                            if (err) {
                                return res.json(handle_generated_error(err));
                            }

                            const users = team.users;
                            UserModel.updateMany({ 
                                _id: {
                                    $in : users
                                }
                            }, {
                                $unset : {
                                    [ `dashboard_level_1.${binary_monitors[monitor_type] ? "two_states" : "three_states"}.${doc.device_id}.${doc.monitor_ref}` ] : 1,
                
                                    [ `dashboard_level_2.${binary_monitors[monitor_type] ? "two_states" : "three_states"}.${doc.device_id}.${doc.monitor_ref}` ] : 1,
                                    
                                    [ `dashboard_level_3.${binary_monitors[monitor_type] ? "two_states" : "three_states"}.${doc.device_id}.${doc.monitor_ref}` ] : 1
                                }
                            },
                            {upsert : true},
                            (err) => {
                               if(err){
                                    return res.json(handle_generated_error(err));
                               }
                                return res.json(handle_success({
                                    message : "Monitor deleted successfully!",
                                    monitor : {...monitor.toObject(), ...remote_response}
                                }))
                            });
                        });
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
                sendData.api_path = `/api/${monitor.type}/mutate/delete`;
                const response_json = await webSocketSendJSON(ws, sendData);
                delete_monitor_in_user(response_json);
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
                            $unset : {
                                [`user_monitors.${user_id}.${agent._id}.${monitor_type}.${monitor.monitor_ref}`]: 1,
                            },
                            $pull : { 
                                [`user_monitors_arr.${user_id}`]: monitor._id
                             },
                            $inc : { monitor_occupancy : -1 }
                        }

                        // Step 4 : Push all updates for team.
                        await DeviceModel.updateOne(
                            {
                                _id: monitor.device_id,
                            },
                            update_device
                        );
                        TeamModel.findOneAndUpdate({
                            _id: team_id,
                        },
                        update_team, 
                        (err, team) => {
                            if (err) {
                                return res.json(handle_generated_error(err));
                            }

                            const users = team.users;
                            UserModel.updateMany({
                                _id: {
                                    $in : users
                                }
                            }, {
                                $unset : {
                                    [ `dashboard_level_1.${binary_monitors[monitor_type] ? "two_states" : "three_states"}.${doc.monitor_ref}` ] : 1,
                
                                    [ `dashboard_level_2.${binary_monitors[monitor_type] ? "two_states" : "three_states"}.${doc.device_id}.${doc.monitor_ref}` ] : 1,
                                    
                                    [ `dashboard_level_3.${binary_monitors[monitor_type] ? "two_states" : "three_states"}.${doc.device_id}.${doc.monitor_ref}` ] : 1
                                }
                            },
                            {upsert : true},
                            (err) => {
                               if(err){
                                    return res.json(handle_generated_error(err));
                               }
                                return res.json(handle_success({
                                    message : "Monitor deleted successfully!",
                                    monitor : {...monitor.toObject(), ...remote_response}
                                }))
                            });
                        });
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



router.post('/remote', async (req, res, next) => {
    const data = req.body;
    console.log("calling remote API");
    const ws = fetchWebSocket(data.agent_id);
    if(!ws) return res.json(handle_error("Remote agent is not connected to the central server."));

    const response = await webSocketSendJSON(ws, data);
    console.log(response ? "response recieved" : "response failed", response);
    return res.json(response);
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