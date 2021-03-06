const express = require('express');
const {NodeSSH} = require('node-ssh')


const DeviceModel = require('../models/Device');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId, Mongoose } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated, not_found, handle_generated_error, maximum_limit_error } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const MonitorModel = require('../models/Monitor');
const router = express.Router();

const ssh = new NodeSSH()

const verbose = "device"
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
            if(team.device_occupancy >= caps.devices) return res.json(maximum_limit_error(verbose))


            if(
                !(
                    is_root(team.root, user_id) || 
                    (team.monitoring_admins.has(user_id) && 
                    team.monitoring_admins.get(user_id) === true)
                )
            ){
                return res.json(not_authenticated);
            }


            const creds = {
                host : data.host,
                username : data.username,
                ...(data.password) && { password : data.password },
                ...(data.privateKey) && { privateKey : data.privateKey },
                ...(data.passphrase) && { passphrase : data.passphrase },
            }
            console.log(creds)

            if(!data.private && parseInt(data.type) != 2){
                try {
                    let connection = await ssh.connect(creds);
                    if(!connection.isConnected){
                        return res.json(handle_error({
                            error : null,
                            message : "Could not confirm remote connectivity, are you sure you entered valid hostname or credentials?",
                        }));
                    }
                } catch (err) {
                    return res.json(handle_error({
                        error : err,
                        message : "Could not confirm remote connectivity, are you sure you entered valid hostname or credentials?",
                    }));
                }
            }

            const final_device_object = {
                name : data.name ,
                team_id : data.team_id ,
                snmp : data.snmp ,
                community_string : data.community_string ,
                type : data.type ,
                username : data.username ,
                host : data.host ,
                creds : creds ,
                private : data.private
                // monitors : data.monitors ,
            }

            try {
                const device = await DeviceModel.create(final_device_object);
                // Step 4 : Set update info
                let update_data = {
                    $push : { [`devices`] : device._id.toString() },
                    $inc : { device_occupancy : 1 },

                    ...(Array.isArray(data.assigned_users) && data.assigned_users.length > 0) && {
                        [`assigned_devices.${device._id}`] : [... new Set(data.assigned_users) , ... new Set(team[`assigned_devices.${device._id}`])]
                    }
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
                        message : "Device created successfully!",
                        device : device
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
            if(team.device_occupancy >= caps.devices) return res.json(maximum_limit_error(verbose))

            const creds = {
                host : data.host,
                username : data.username,
                ...(data.password) && { password : data.password },
                ...(data.privateKey) && { privateKey : data.privateKey },
                ...(data.passphrase) && { passphrase : data.passphrase },
            }

            if(!data.private && parseInt(data.type) != 2){
                try {
                    let connection = await ssh.connect(creds);
                    if(!connection.isConnected){
                        return res.json(handle_error({
                            error : null,
                            message : "Could not confirm remote connectivity, are you sure you entered valid credentials?",
                        }));
                    }
                } catch (err) {
                    return res.json(handle_error({
                        error : err,
                        message : "Could not confirm remote connectivity, are you sure you entered valid credentials?",
                    }));
                }
            }

            const final_device_object = {
                name : data.name ,
                team_id : data.team_id ,
                snmp : data.snmp ,
                community_string : data.community_string ,
                type : data.type ,
                username : data.username ,
                host : data.host ,
                creds : creds ,
                private : data.private
                // monitors : data.monitors ,
            }

            try {
                const device = await DeviceModel.create(final_device_object);

                // Step 4 : Set update info
                let update_data = {
                    $push : { [`user_devices.${user_id}`] : device._id.toString() },
                    $inc : { device_occupancy : 1 }
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
                    message : "Device created successfully!",
                    device : device
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
        let device_id = data.device_id;
        if(found_invalid_ids([user_id, team_id, device_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."))
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            
            if(!team.devices.includes(device_id)) return res.json(handle_error("Device not found in your Team."))
            if(
                !(
                    is_root(team.root, user_id) || 
                    (team.monitoring_admins.has(user_id) && 
                    team.monitoring_admins.get(user_id) === true)
                )
            ){
                return res.json(not_authenticated);
            }

            const update_device_object = data

            const creds = {
                ...(data.username) && {username : data.username},
                ...(data.host) && {host : data.host},
                ...(data.password) && { password : data.password },
                ...(data.privateKey) && { privateKey : data.privateKey },
                ...(data.passphrase) && { passphrase : data.passphrase },
            }
            if(Object.keys(creds).length !== 0){
                update_device_object.creds = creds;
            }

            DeviceModel.findOneAndUpdate({
                _id: device_id,
            }, update_device_object, 
            {new : true},
            (err, device) => {
                if (err) {
                    return res.json(handle_generated_error(err))
                }
                if(!device) return res.json(not_found("Device"))

                return res.json(handle_success(device))
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
        let device_id = data.device_id;
        if(found_invalid_ids([user_id, team_id, device_id]).invalid){
            res.json(handle_error("Invalid IDs found in your request."))
        }
        TeamModel.findById({ 
            _id : team_id
        }, async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            if(!(
                team.user_devices.has(user_id) && team.user_devices.get(user_id).includes(device_id)
            )) return res.json(handle_error("Device not found in your account."))


            const update_device_object = data

            const creds = {
                ...(data.password) && { password : data.password },
                ...(data.privateKey) && { privateKey : data.privateKey },
                ...(data.passphrase) && { passphrase : data.passphrase },
            }
            if(Object.keys(creds).length !== 0){
                update_device_object.creds = creds;
            }

            DeviceModel.findOneAndUpdate({
                _id: device_id,
            }, update_device_object, 
            {new : true},
            (err, device) => {
                if (err) {
                    return res.json(handle_generated_error(err))
                }
                if(!device) return res.json(not_found("Device"))

                return res.json(handle_success(device))
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
        let device_id = data.device_id;
        if(found_invalid_ids([user_id, team_id, device_id]).invalid){
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
            const team_devices = team.devices.filter(device => isValidObjectId(device));
            if(team_devices.length == 0) return res.json(handle_success([]));
            DeviceModel.find(
                {
                    _id : {
                        $in : team_devices
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
            
            const team_devices = (team.user_devices.get(user_id) && team.user_devices.get(user_id).length) ? team.user_devices.get(user_id).filter(device => isValidObjectId(device)) : team.user_devices.get(user_id);
            if(!(team_devices && team_devices.length > 0)) return res.json(handle_success([]));

            DeviceModel.find(
                {
                    _id : {
                        $in : team_devices
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

router.post('/enumerate/device', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const device_id = data.device_id;
    if( found_invalid_ids([user_id, team_id, device_id]).invalid ){
        return res.json(handle_error("Invalid parameter [id]s."))
    }
    console.log(device_id)

    TeamModel.findById({
        _id : team_id
    }, async (err, team) => {

        if(err) return res.json(handle_generated_error(err))
        if(!team) return res.json(not_found("Team"))
    
        // Enumerate the device
        var device = {};
        if(data.show_creds){
            device = await DeviceModel.findById(
                { 
                    _id : device_id
                }, 
            );
        }else{
            device = await DeviceModel.findById(
                {
                    _id : device_id
                }, 
            ).select('-creds -username -team');
        }
        if(!device) return res.json(handle_error("Device not found"))
        device.creds.host = device.host;
        device.creds.username = device.username
        if(data.show_monitors){
            let obtained_monitors = {};
            let obtained_monitors_array = [];
            if(!device.monitors) return res.json(handle_success({...(device.toObject()), ...{monitors : []} }));
            device.monitors.forEach(agent => {
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
                if(err) return res.json(handle_error(err))

                if(!monitors) return res.json(handle_error({message : "No monitors found."}))

                return res.json(handle_success({...(device.toObject()), ...{monitors : monitors} }))
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
            
        }else{
            return res.json(handle_success(device))
        }
        

    });
})

router.post('/delete/team', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const device_id = data.device_id;
    if(!(user_id || team_id || device_id)){
        return res.json("Insufficient parameters.");
    }

    if(found_invalid_ids([user_id, team_id, device_id]).invalid){
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
            // team.devices.has(device_id) && 
            !(   
                isRoot || 
                ( team.device_admins.has(user_id) && team.device_admins.get(user_id) === true ) || 
                (team.assigned_devices.has(user_id) && team.assigned_devices.get(user_id)[device_id] === true)
            )
        ){
            console.log("Root  : ", team.root, "User ID : ", user_id)
            return res.json(handle_error("You're not authenticated to perform this operation."));
        }

        return DeviceModel.findById({ 
            _id : data.device_id
        }, (err, device) => {
            if(err) return res.json(handle_generated_error(err))
            if(!device) return res.json(not_found("Device"))

            const monitors = device.monitors;
            const monitors_arr = [];
            // monitors.map((el) => console.log(el))
            // monitors.keys().forEach(el => console.log(el))
            for(const el of monitors){
                const agent_key = el[0];
                const agent = el[1];
                for (const monitor_type in agent) {
                        if (Object.hasOwnProperty.call(agent, monitor_type)) {
                            const monitor_ids = agent[monitor_type];
                            for (const monitor_id in monitor_ids) {
                                monitors_arr.push(monitor_id);
                            }
                        }
                    }
            }

            MonitorModel.find({ 
                _id : {
                    $in : monitors_arr
                }
            }, (err, docs) => {
                if(err) return res.json(handle_generated_error(err));
                const monitors_count = docs.length;
                if(docs.length > 0) return res.json(handle_error(`There ${monitors_count > 1 ? "are" : "is"} ${monitors_count} monitor${monitors_count > 1 ? "s" : ""} present in this device, please delete them before proceeding to delete this device.`))
                //Delete the device
                DeviceModel.deleteOne({
                    _id: data.device_id
                }, (err) => {
                    if(err){
                        return res.json(handle_generated_error(err));
                    }else{
                        TeamModel.updateOne({
                            _id: team_id
                        }, {
                            $pull : {devices : data.device_id},
                            $inc : { device_occupancy : -1 }
                        },
                        (err) => {
                            if(err){
                                console.log(`Error: ` + err)
                            }
                        });
                        return res.json(handle_success("Device deleted successfully."));
                    }
                });
            });
        });

    });
})

router.post('/delete/user', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const delete_user_id = data.delete_user_id;
    const team_id = data.team_id;
    const device_id = data.device_id;

    if(!(user_id || team_id || device_id)){
        return res.json("Insufficient parameters.");
    }

    if(found_invalid_ids([user_id, team_id, device_id]).invalid){
        return res.json(handle_error("Invalid parameter [id]s."))
    }
    TeamModel.findById({
        _id : team_id
    }, (err, team) => {
        // Basic check.
        if(err) return res.json(handle_generated_error(err))
        if(!team) return res.json(not_found("Team"))

    
        if(!team.user_devices.has(user_id)) return res.json(handle_error("There are no devices in your account."))
        // if(!team.user_devices.get(user_id).includes(device_id)) return res.json(handle_error("The device you're trying to delete is not present in your account."))
        
        // console.log(team.user_devices.get(delete_user_id))
        return DeviceModel.findById({ 
            _id : data.device_id
        }, (err, device) => {
            if(err) return res.json(handle_generated_error(err))
            if(!device) return res.json(not_found("Device"))

            const monitors = device.monitors;
            const monitors_arr = [];
            // monitors.map((el) => console.log(el))
            // monitors.keys().forEach(el => console.log(el))
            console.log("---------------------------------")
            for(const el of monitors){
                const agent_key = el[0];
                const agent = el[1];
                for (const monitor_type in agent) {
                        if (Object.hasOwnProperty.call(agent, monitor_type)) {
                            const monitor_ids = agent[monitor_type];
                            for (const monitor_id in monitor_ids) {
                                monitors_arr.push(monitor_id);
                            }
                        }
                    }
            }

            MonitorModel.find({ 
                _id : {
                    $in : monitors_arr
                }
            }, (err, docs) => {
                if(err) return res.json(handle_generated_error(err));
                console.log(docs);
                const monitors_count = docs.length;
                if(monitors_count > 0) return res.json(handle_error(`There ${monitors_count > 1 ? "are" : "is"} ${monitors_count} monitor${monitors_count > 1 ? "s" : ""} present in this device, please delete them before proceeding to delete this device.`))
                //Delete the device
                DeviceModel.deleteOne({
                    _id: data.device_id
                }, (err) => {
                    if(err){
                        return res.json(handle_generated_error(err));
                    }else{
                        TeamModel.updateOne({
                            _id: team_id
                        }, {
                            $pull : {[`user_devices.${user_id}`] : device_id},
                            $inc : { device_occupancy : -1 }
                        },
                        (err) => {
                           if(err) return res.json(handle_generated_error(err));
                           return res.json(handle_success("Device deleted successfully."));
                        });
                    }
                });
            });
        });
        
    });
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    const ids_array = JSON.parse(data.device_ids);
    await DeviceModel.find().where('_id').in(ids_array).select('-creds').exec((err, resp) => {
        if(err){
            return res.json(handle_error(err));
        }else{
            return res.json(handle_success(resp))
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