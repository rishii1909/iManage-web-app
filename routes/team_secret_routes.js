const express = require('express');
const passport = require('passport');   
const jwt = require('jsonwebtoken');
const shortid = require('shortid');
const TeamSecretModel = require('../models/TeamSecret');
const { handle_success, handle_error, is_root, no_docs_or_error, not_authenticated, exclusive_root_user_action } = require('../helpers/plans');
const UserModel = require('../models/User');

const router = express.Router();

const create_options = { upsert: true, new : true };

router.post('/create', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    
    TeamSecretModel.findOneAndUpdate(
    {
        team_id: team_id,
    }, 
    {
        secret: shortid.generate(),
    },
    create_options
    ).select("-team_id -_id").exec(
    (err, secret) => {
        const invalid = no_docs_or_error(secret, err);
        if(invalid.is_true) return res.json(invalid.message);

        return res.json(handle_success(secret));
    });
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    try {
        await TeamSecretModel.findOne({team_id : data.team_id}).select("-team_id -_id").exec((err, response) => {
            if(!err){
                res.json(handle_success(response));
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
        await TeamSecretModel.findById({_id : team_id}, (err, response) => {
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

                TeamSecretModel.updateOne({
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