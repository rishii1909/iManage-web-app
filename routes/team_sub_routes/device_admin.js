const express = require('express');

const TeamModel = require('../../models/Team');
const { handle_success, handle_error, is_root, no_docs_or_error } = require('../../helpers/plans');

const router = express.Router();



router.post('/add', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const new_user_name = data.new_user_name;
    const new_user_id = data.new_user_id;
    const team_id = data.team_id;
    try {
        await TeamModel.findById({_id : team_id}, (err, response) => {
            // Check if response is valid.
            const invalid = no_docs_or_error(response, err);
            if(invalid.is_true){
                console.log(err, response);
                return res.json(invalid.message);
            }

            //Actual code.
            let team = response;
            let root_user = team.root;
            // Checks.
            if(!is_root(root_user, user_id)){
                return res.json(handle_error("Only the root user can add new device admins."))
            }
            if(team.device_admins.has(new_user_id)){
                if(team.device_admins.get(new_user_id)){
                    return res.json(handle_error(  new_user_name + " is already a device admin."));
                }else{
                    return res.json(handle_error(new_user_name + " is already a (revoked) device admin."))
                }
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
        });
    } catch (err) {
        console.log(err);
    }
})

router.post('/revoke', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const revoke_user_name = data.revoke_user_name;
    const revoke_user_id = data.revoke_user_id;
    const team_id = data.team_id;
    try {
        await TeamModel.findById({_id : team_id}, (err, response) => {
            if(!err){
                let team = response;
                let root_user = team.root;
                // Checks.

                if(!is_root(root_user, user_id)){
                    return res.json(handle_error("Only the root user can revoke device admin permissions."))
                }
                if(!team.device_admins.has(revoke_user_id)){
                    return res.json(handle_error(revoke_user_name + "is not a device admin."))
                }

                if(team.device_admins.get(revoke_user_id) === false){
                    return res.json(handle_error(revoke_user_name + "'s device admin privileges are already revoked."))
                }

                // Actual operations.

                TeamModel.updateOne({
                    _id: team_id
                }, {
                    [`device_admins.${revoke_user_id}`]: false
                },
                (err) => {
                    if(err){
                        return res.json(handle_error(err));
                    }else{
                        return res.json(handle_success(revoke_user_name + "'s device admin privileges have been revoked."))
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


module.exports = router