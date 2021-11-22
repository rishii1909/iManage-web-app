const express = require('express');

const TeamModel = require('../../models/Team');
const { handle_success, handle_error, is_root, no_docs_or_error, handle_generated_error } = require('../../helpers/plans');
const UserModel = require('../../models/User');

const router = express.Router();



router.post('/add', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    let users = data.users;
    const team_id = data.team_id;
    if(!Array.isArray(users)) return res.json(handle_error("Users parameter is not an array."))
    if(users.length == 0) return res.json(handle_error("No Users selected."))
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
                return res.json(handle_error("Only the root user can add new monitoring admins."))
            }
            // Actual operations.
            users = users.filter(user => !team.monitoring_admins.includes(user))
            if(!users.length) return res.json(handle_success("Selected users are now a monitoring admin!"));
            TeamModel.updateOne({
                _id: team_id
            }, {
                $push : {
                    monitoring_admins : {
                        $each : users
                    }
                }
            },
            (err) => {
                if(err){
                    return res.json(handle_error(err));
                }else{
                    return res.json(handle_success("Selected users are now a monitoring admin!"))
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
    const users = data.users;
    const team_id = data.team_id;
    if(!Array.isArray(users)) return res.json(handle_error("Users parameter is not an array."))
    if(users.length == 0) return res.json(handle_error("No Users selected."))

    try {
        await TeamModel.findById({_id : team_id}, (err, response) => {
            if(err) return res.json(handle_generated_error(err))
            let team = response;
            let root_user = team.root;
            // Checks.
            if(!is_root(root_user, user_id)){
                return res.json(handle_error("Only the root user can revoke monitoring admin permissions."))
            }
            // Actual operations.
            TeamModel.updateOne({
                _id: team_id
            }, {
                $pull : {
                    monitoring_admins : {
                        $in : users
                    },
                }
            },
            (err) => {
                if(err){
                    return res.json(handle_generated_error(err));
                }else{
                    return res.json(handle_success("monitoring admin privileges have been revoked for selected users."))
                }
            });

        });
    } catch (err) {
        console.log(err);
    }
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    try {
        await TeamModel.findById({_id : data.team_id}, async (err, team) => {
           if(!team) return res.json(not_found("Team"));
           if(err) return res.json(handle_generated_error(err))
            UserModel.find({ 
                _id: {
                    $in : team.monitoring_admins
                }
            },
            "name email",  
            (err, users) => {
               if(err){
                   return res.json(handle_generated_error(err));
               }
               return res.json(handle_success(users));
            });
        });
    } catch (err) {
        // console.log(handle_error({err}));
    }
})

module.exports = router