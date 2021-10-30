const express = require('express');
const {NodeSSH} = require('node-ssh')


const DeviceModel = require('../models/Device');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { get_capacity, handle_error, handle_success, is_root, found_invalid_ids, no_docs_or_error, not_authenticated } = require('../helpers/plans');
const TeamModel = require('../models/Team');
const UserModel = require('../models/User');
const MonitorModel = require('../models/Monitor');
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
            if(
                !(
                    isRoot || 
                    (team.device_admins.has(user_id) && 
                    team.device_admins[user_id] === true)
                )
            ){
                console.log(isRoot, user_id, team.root)
                return res.json(not_authenticated);
            }

            // Step 1 : Check for vacancy.
            if(team.devices.size >= caps.devices) return res.json(handle_error("Max devices limit exceeded."));

            // Step 2 : Check if the given remote device is accessible.
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
            // Step 3 : Create the device
            data.creds = creds;
            try {
                const device = await DeviceModel.create(data);
                // Step 4 : Set update info
                let update_data = {
                    [`devices.${device._id}`]: true,
                    $inc : { device_occupancy : 1 }
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
                    message : "Device created successfully!",
                    device : device
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
            if(team.device_occupancy >= caps.devices) return res.json(handle_error("Max devices limit exceeded."));

            // Step 2 : Check if the given remote device is accessible.
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
                    return res.json(handle_error({
                        error : err,
                        message : "Could not confirm remote connectivity, are you sure you entered the right credentials?",
                    }));
                }
            }
            // Step 3 : Create the device
            data.creds = creds;
            try {
                const device = await DeviceModel.create(data);
                // Step 4 : Update user_devices array for the current team.
                var updateInfo = {
                    $inc : { device_occupancy : 1 }
                };
                if(!team.user_devices.has(user_id) || !team.user_devices.get(user_id)){
                    updateInfo = { 
                        [`user_devices.${user_id}`] : {
                            [`${device._id}`] : true
                        }
                    }
                }else{
                    updateInfo = {
                        [`user_devices.${user_id}.${device._id}`]: true
                    }
                }
                TeamModel.updateOne({
                    _id: team._id,
                }, 
                updateInfo,
                (err, doc) => {
                    if (err) {
                        console.log(user_id, device._id), 
                        console.log(err, handle_error("Couldn't update Team"));
                    }
                });
                res.json(handle_success({
                    message : "Device created successfully!",
                    device : device
                }))
            } catch (err) {
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

router.post('/update/team', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const device_id = data.device_id;
    data._id = device_id;
    if(!(user_id || team_id || device_id)){
        return res.json("Insufficient parameters.");
    }
    if(!(isValidObjectId(user_id) || isValidObjectId(device_id) || isValidObjectId(team_id))){
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
        console.log(team.devices);
        if( 
            //Device exists in the team
            !(
                team.devices.has(device_id) && 
                (
                    // if current user is root user.
                    isRoot || 
                    // if current user is a device admin.
                    team.device_admins.has(user_id) || 
                    // if selected device has been assigned to the current user.
                    (team.assigned_devices.has(user_id) && team.assigned_devices.get(user_id)[device_id] === true)
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the device
            DeviceModel.findByIdAndUpdate({ 
                _id: device_id
            }, 
            data, {new : true})
            .select('-creds')
            .exec(
            (err,resp) => {
                if(err){
                    return res.json(handle_error("There was an error while updating your device."));
                }
                    return res.json(handle_success({
                        message : "Device updated successfully.",
                        response : resp,
                    }));
            
            });

    });
})
router.post('/update/user', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const device_id = data.device_id;
    data._id = device_id;
    if(!(user_id || team_id || device_id)){
        return res.json("Insufficient parameters.");
    }
    if(!(isValidObjectId(user_id) || isValidObjectId(device_id) || isValidObjectId(team_id))){
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
            //Device exists in the team
            !(
                (
                    // if current user is root user.
                    isRoot || 
                    // if current user owns the device.
                    team.user_devices.has(user_id) && team.user_devices.get(user_id)[device_id] === true
                    
                )
            )
        ){
            return res.json(not_authenticated);
        }
            //Update the device
            DeviceModel.findByIdAndUpdate({ 
                _id: device_id
            }, 
            data, {new : true})
            .select('-creds')
            .exec(
            (err,resp) => {
                if(err){
                    return res.json(handle_error("There was an error while updating your device."));
                }
                    return res.json(handle_success({
                        message : "Device updated successfully.",
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
            // team.devices.has(device_id) && 
            (   
                isRoot || 
                ( team.device_admins.has(user_id) && team.device_admins[user_id] === true )
            )
        ){
            // Enumerate the device
            let devices_array = Array.from( team.devices.keys() );
            return res.json(handle_success(
                await DeviceModel.find({
                    _id : {
                        $in : devices_array
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
            res.json(handle_error("Your team could not be identified."));
        }
        const user_devices_object = team.user_devices.get(user_id);
        if(!user_devices_object) return res.json(handle_error("You haven't created any devices yet."));
        const devices_array = Object.keys(team.user_devices.get(user_id));
        
        return res.json(handle_success(
            await DeviceModel.find({
                _id : {
                    $in : devices_array
                }
            })
        ));

    });
})

router.post('/enumerate/device', (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const device_id = data.device_id;
    if( found_invalid_ids([user_id, team_id, device_id]) ){
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
            team.devices.has(device_id) && 
            (   
                isRoot || 
                ( team.device_admins.has(user_id) && team.device_admins[user_id] === true ) || 
                (team.assigned_devices.has(user_id) && team.assigned_devices[user_id][device_id] === true)
            )
        ){
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
            let enumerate = {}; 
            if(data.show_monitors){
                let monitors_array = Array.from( device.monitors.keys() );
                enumerate = await MonitorModel.find({
                    _id : {
                        $in : monitors_array
                    }
                });
                console.log(enumerate);
                // device.monitors = device_monitors;
            }
            return res.json(handle_success(enumerate ? {...(device.toObject()), ...{monitors : enumerate}} : device));
        }else{
            return res.json(handle_error("You're not authenticated to perform this operation."));
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

    if(found_invalid_ids([user_id, team_id, device_id])){
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
        //Delete the device
        DeviceModel.deleteOne({
            _id: data.device_id
        }, (err) => {
            if(err){
                return res.json(handle_error("There was an error while deleting your device."));
            }else{
                team.devices.delete(device_id);
                TeamModel.updateOne({
                    _id: team_id
                }, {
                    devices: team.devices,
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

    if(found_invalid_ids([user_id, team_id, device_id])){
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
                    team.device_admins.has(user_id) && team.device_admins[user_id] === true
                )
            )
        ){
            console.log(team.user_devices, user_id)
            return res.json(not_authenticated);
        }

        if( !isRoot && !( team.user_devices.has(delete_user_id) && team.user_devices[delete_user_id].has(device_id) ) ){
            console.log(team.user_devices, delete_user_id, device_id);
            return res.json(handle_error("Device not found."));
        }
        // console.log(team.user_devices.get(delete_user_id), typeof team.user_devices.get(delete_user_id));
        
        try {
            delete team.user_devices.get(delete_user_id)[device_id];
        } catch (err) {
            return res.json(handle_error("There was an error while deleting your device."))
        }
        // console.log(team.user_devices.get(delete_user_id))

        //Delete the device
        DeviceModel.deleteOne({
            _id: data.device_id
        }, (err) => {
            if(err){
                return res.json(handle_error("There was an error while deleting your device."));
            }else{
                TeamModel.updateOne({ 
                    _id: team_id
                }, 
                {
                    [`user_devices.${delete_user_id}`]: team.user_devices[delete_user_id],
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
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    const ids_array = JSON.parse(data.device_ids);
    await DeviceModel.find().where('_id').in(ids_array).select('-creds').exec((err, resp) => {
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