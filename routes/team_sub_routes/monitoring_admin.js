const express = require('express');

const TeamModel = require('../../models/Team');
const { handle_success, handle_error, is_root, no_docs_or_error, handle_generated_error, not_found } = require('../../helpers/plans');
const UserModel = require('../../models/User');
const MonitorAdminModel = require('../../models/MonitorAdmin');

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

router.post('/add/one', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    let add_user_id = data.add_user_id;
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
                return res.json(handle_error("Only the root user can add new monitoring admins."))
            }
            // Actual operations.
            data.user_id = data.add_user_id;
            const profile = MonitorAdminModel.create(data);
            if(!profile) return res.json(handle_error("Admin profile could not be created."));

            TeamModel.updateOne({
                _id: team_id
            }, {
                $push : {
                    monitoring_admins : add_user_id
                }
            },
            (err) => {
                if(err){
                    return res.json(handle_error(err));
                }else{
                    return res.json(handle_success(`${data.name ? data.name : "This user"} is now a monitoring admin!`))
                }
            });
        });
    } catch (err) {
        console.log(err);
    }
})

router.post('/update', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    let udpate_user_id = data.udpate_user_id;
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
                return res.json(handle_error("Only the root user can add new monitoring admins."))
            }
            // Actual operations.
            data.user_id = data.add_user_id;
            MonitorAdminModel.findOneAndUpdate({
                user_id: update_user_id,
            }, 
            {
                ...data,
                ...{user_id : update_user_id}
            },
            { new : true }, 
            (err, doc) => {
                if (err) {
                    console.log(`Monitor admin profile update error: ` + err)
                    return res.json(handle_error(err));
                }
                return res.json(handle_success(doc));
            });
        });
    } catch (err) {
        console.log(err);
    }
})



router.post('/revoke/one', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const revoke_user_id = data.revoke_user_id;
    const team_id = data.team_id;

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
            MonitorAdminModel.findOneAndDelete({ 
                user_id: revoke_user_id
            }, (err, doc) => {
                if(err) return res.json(handle_error(err))
                if(!doc) return res.json(handle_error(not_found("Monitor admin profile")))
                
                TeamModel.updateOne({
                    _id: team_id
                }, {
                    $pull : {
                        monitoring_admins : revoke_user_id
                    }
                },
                (err) => {
                    if(err){
                        return res.json(handle_generated_error(err));
                    }else{
                        return res.json(handle_success("monitoring admin privileges have been revoked for the selected user."))
                    }
                });
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

router.post('/enumerate/one', async (req, res, next) => {
    const data = req.body;
    const team_id = data.team_id;
    const enum_id = data.enum_id;
    try {
        MonitorAdminModel.findOne({
            user_id: enum_id,
        }).then((doc) => {
            if (!doc) {
                return res.json(not_found("Monitor admin profile"));
            }
            return res.json(handle_success(doc))
        });
    } catch (err) {
        // console.log(handle_error({err}));
    }
})

module.exports = router