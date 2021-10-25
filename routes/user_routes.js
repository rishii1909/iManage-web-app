const express = require('express');
const passport = require('passport');   
const jwt = require('jsonwebtoken');

const TeamModel = require('../models/Team');
const { handle_success, handle_error, is_root, no_docs_or_error, not_authenticated, exclusive_root_user_action } = require('../helpers/plans');
const UserModel = require('../models/User');

const router = express.Router();


router.post('/update', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    const user_update_id = data.user_update_id;
    const update_fields = {
        ...(data.email) && { email : data.email },
        ...(data.name) && { name : data.name },
    }
    try {
        await TeamModel.findById({ 
            _id : team_id
        }, (err, team) => {
            // Check if valid IDs are passed.
            const invalid = no_docs_or_error(team, err);
            if(invalid.is_true) return res.json(invalid.message);

            const isRoot = is_root(team.root, user_id);

            // Non root user trying to update root user.
            if(!isRoot && is_root(team.root, user_update_id)){
                return res.json(exclusive_root_user_action);
            }
            // Insufficient permissions for given user.
            if(
                !(
                    isRoot || 
                    ( team.user_admins.has(user_id) && team.user_admins[user_id] === true )
                )
            ){
                return res.json(not_authenticated);
            }

            UserModel.findOneAndUpdate({
                _id: user_update_id,
            }, update_fields, (err, updated_user) => {
                // Validation checks.
                const update_failed = no_docs_or_error(updated_user, err);
                if(update_failed.is_true){
                    return res.json(update_failed.message);
                }
                res.json(handle_success(updated_user));
            });
        });
    } catch (err) {
        res.json(handle_error(err.message));
    }
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    try {
        await TeamModel.findById({_id : data.team_id}, (err, response) => {
            if(!err){
                console.log(err, response)
                res.json(handle_success({response}));
            }else{
                res.json(handle_error({err}));
            }
        });
    } catch (err) {
        // console.log(handle_error({err}));
    }
})

router.post('/device_admin/add', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    // const new_user_id = data.new_user.user_id;
    // const new_user_name = data.new_user.name;
    const new_user_id = data.new_user_id;
    const new_user_name = data.new_user_name;
    const team_id = data.team_id;
    try {
        await TeamModel.findById({_id : team_id}, (err, response) => {
            if(!err){
                let team = response;
                let root_user = team.root;
                console.log(team);
                // Checks.

                if(!is_root(root_user, user_id)){
                    return res.json(handle_error("Only the root user can add new device admins."))
                }
                if(team.device_admins.has(new_user_id)){
                    return res.json(handle_error(  new_user_name + " is already a device admin."));
                }

                // Actual operations.

                TeamModel.updateOne({
                    _id: team_id
                }, {
                    [`device_admins.${new_user_id}`]: true
                },
                (err) => {
                    if(err){
                        return res.json(handle_error(err));
                    }else{
                        return res.json(handle_success(new_user_name + " is now a device admin!"))
                    }
                });

            }else{
                res.json(handle_error({err}));
            }
        });
    } catch (err) {
        console.log(err);
    }
})


module.exports = router;