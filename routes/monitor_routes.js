const express = require('express');
const {NodeSSH} = require('node-ssh')


const MonitorModel = require('../models/Monitor');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated, check_monitor_type, invalid_monitor_type, binary_monitors } = require('../helpers/plans');
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
        return;
        // Alternate version saved for reference, reuse some of the code below to authenticate above.
        User.findById({
            _id : user_id
        }).populate('team_id').populate('device_id').populate('agent_id').exec(async (err, user) => {
        // }).populate('team_id').populate('device_id').populate('agent_id').exec(async (err, user) => {
            if(!user || err) res.json(handle_error("Could not retrieve valid data from database."));

            const team = user.team_id;
            const device = user.device_id;
            const agent = user.agent_id;

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
                return res.json(not_authenticated);
            }

            // Step 1 : Check for vacancy.
            if(team.monitor_occupancy >= caps.monitors) return res.json(handle_error("Max monitors limit exceeded."));

            // Step 2 : Create the monitor
            try {
                axios.post(
                    `${agent.api_url}/api/${data.type}/mutate/create`, 
                    data
                ).then(response => {
                    return res.json(response);
                })
                const monitor = await MonitorModel.create(data);
                if(!monitor) return res.json(handle_error("Monitor could not be created."));

                // Step 3 : Set update info
                let update_device = {
                    [`monitors.${monitor._id}`]: true,
                }
                let update_team = {
                    [`monitors.${data.type}.${monitor._id}`]: true,
                    [`user_monitors.${user_id}.${monitor._id}`]: true,
                    $inc : { monitor_occupancy : 1 }
                }
                // Step 4 : Push all updates for team.
                const device_update = await DeviceModel.updateOne(
                    {
                        _id: device_id,
                    },
                    update_device
                );
                const team_update = await TeamModel.updateOne(
                    {
                        _id : team._id,
                    },
                    update_team
                );
                res.json(handle_success({
                    message : "Monitor created successfully!",
                    monitor : monitor
                }))
            } catch (err) {
                console.log(err);
                return res.json(handle_error(err.message));
            } 
        });
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
                        [`user_monitors.${agent_id}.${monitor_type}.${monitor.monitor_ref}`]: true,
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
        return;
        // Alternate version saved for reference, reuse some of the code below to authenticate above.
        User.findById({
            _id : user_id
        }).populate('team_id').populate('device_id').populate('agent_id').exec(async (err, user) => {
        // }).populate('team_id').populate('device_id').populate('agent_id').exec(async (err, user) => {
            if(!user || err) res.json(handle_error("Could not retrieve valid data from database."));

            const team = user.team_id;
            const device = user.device_id;
            const agent = user.agent_id;

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
                return res.json(not_authenticated);
            }

            // Step 1 : Check for vacancy.
            if(team.monitor_occupancy >= caps.monitors) return res.json(handle_error("Max monitors limit exceeded."));

            // Step 2 : Create the monitor
            try {
                axios.post(
                    `${agent.api_url}/api/${data.type}/mutate/create`, 
                    data
                ).then(response => {
                    return res.json(response);
                })
                const monitor = await MonitorModel.create(data);
                if(!monitor) return res.json(handle_error("Monitor could not be created."));

                // Step 3 : Set update info
                let update_device = {
                    [`monitors.${monitor._id}`]: true,
                }
                let update_team = {
                    [`monitors.${data.type}.${monitor._id}`]: true,
                    [`user_monitors.${user_id}.${monitor._id}`]: true,
                    $inc : { monitor_occupancy : 1 }
                }
                // Step 4 : Push all updates for team.
                const device_update = await DeviceModel.updateOne(
                    {
                        _id: device_id,
                    },
                    update_device
                );
                const team_update = await TeamModel.updateOne(
                    {
                        _id : team._id,
                    },
                    update_team
                );
                res.json(handle_success({
                    message : "Monitor created successfully!",
                    monitor : monitor
                }))
            } catch (err) {
                console.log(err);
                return res.json(handle_error(err.message));
            } 
        });
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

        const binaryObject = {
            null : 0,
            0 : 0,
            1 : 0,
        };
        const ternaryObject = {
            null : 0,
            0 : 0,
            1 : 0,
            2 : 0
        };
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
                
            },

            level_3 : {

            }
        }
        // Looping through all agents.
        
        const user_monitors = isEmpty(team.user_monitors) ? {} : team.user_monitors;
        const team_monitors = isEmpty(team.monitors) ? {} : team.monitors;
        console.log(user_monitors, team_monitors);
        const final_monitors_object = {
            ...(isEmpty(team.user_monitors))
        };
        return res.json(handle_success(final_monitors_object));
        if(isEmpty(final_monitors_object)) return res.json(handle_success(final_response_object));
        
        if(!monitors.size) return res.json(handle_success({}))
        const fetch_urls = await AgentModel.find({
            _id : {
                $in : Array.from( monitors.keys() )
            }
        }).select("api_url");
        monitors.forEach( async (monitor_type, agent_key) => {            
            // Looping through all monitor types for an agent.
            for (const monitor_type_key in monitor_type) {
                if (Object.hasOwnProperty.call(monitor_type, monitor_type_key)) {
                    
                    //Loooping through all monitors.
                    const monitors = Object.keys(monitor_type[monitor_type_key]);
                    // axios.post(`${agent.api_url}/api/${data.type}/mutate/create`)
                    const target_agent = fetch_urls.find(obj => {
                        return obj._id == agent_key
                    });
                    await axios.post(
                        `${target_agent.api_url}/api/${monitor_type_key}/fetch/view/many`,
                        {monitors}
                    ).then((response) => {
                        const resp = response.data;
                        test = resp;
                        if(resp.accomplished){
                            for (const key in resp.response) {
                                if (Object.hasOwnProperty.call(resp.response, key)) {
                                    const rec = resp.response[key];
                                    // Adding to level 1 - starts
                                    if(binary_monitors[monitor_type_key] === true){
                                        final_response_object.level_1.two_states[rec._id.monitor_status] += rec.count
                                    }else{
                                        final_response_object.level_1.three_states[rec._id.monitor_status] += rec.count
                                    }
                                    // Adding to level 1 - ends

                                    // Adding to level 2 - starts
                                    if( final_response_object.level_2[rec._id.device] && final_response_object.level_2[rec._id.device][rec._id.monitor_status] ){
                                        final_response_object.level_2[rec._id.device][rec._id.monitor_status] += rec.count;
                                    }else{
                                        final_response_object.level_2[rec._id.device] = {
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
                        return res.json(handle_error(err.message ? err.message : err))
                    })

                    // Add check for enabled/disabled monitors here later.
                }
            }
            // return res.json({binaryObject, ternaryObject});
            return res.json(handle_success(final_response_object));
        })
    });
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