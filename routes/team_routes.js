const express = require('express');

const TeamModel = require('../models/Team');
const { handle_success, handle_error, is_root, no_docs_or_error, handle_generated_error, not_found } = require('../helpers/plans');
const AgentModel = require('../models/Agent');

const router = express.Router();


// router.post('/create', async (req, res, next) => {
//     const data = req.body;
//     data.users = {
//         [req.user._id] : {
//             active : true,
//             billing : true,
//             monitoring : true,
//         }
//     }
//     data.root = req.user._id;
//     const team = await TeamModel.create(data);
//     res.json({
//         message : "Team created successfully!",
//         team : team,
//     })
// })

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    try {
        TeamModel.findOne({_id : data.team_id})
        .populate(
            [
                {
                    path : "analytic_groups",
                    select : "name"
                },
                {
                    path : "device_groups",
                    select : "name"
                },
                {
                    path : "billing_admins",
                    select : "name email"
                },
                {
                    path : "monitoring_admins",
                    select : "name email"
                },
                {
                    path : "sudoers_admins",
                    select : "name email"
                }
            ]
        )
        .exec( async (err, team) => {
            if(err) return res.json(handle_generated_error(err));
            if(!team) return res.json(not_found("Team"));
            // team_monitors = {};
            // agent_id_keys = Array.from(team.monitors.keys());
            // agent_fetched_keys = await AgentModel.find({ 
            //     _id: {
            //         $in : agent_id_keys
            //     }
            // }).select('name');
            // agent_fetched_keys.forEach((agent) => {

            //     team_monitors[agent.name] = team.monitors.get(agent._id.toString());
            // })
            // console.log(team_monitors);
            return res.json(handle_success({response: team}));
        });
    } catch (err) {
        // console.log(handle_error({err}));
    }
})

router.post('/enumerate/team/monitors', async (req, res, next) => {
    const data = req.body;
    try {
        await TeamModel.findById({_id : data.team_id}, async (err, team) => {
            const invalid = no_docs_or_error(team, err);
            if(invalid.is_true){
                console.log(err, team)
                return res.json(invalid.message);
            }
            // team_monitors = {};
            // agent_id_keys = Array.from(team.monitors.keys());
            // agent_fetched_keys = await AgentModel.find({ 
            //     _id: {
            //         $in : agent_id_keys
            //     }
            // }).select('name');
            // agent_fetched_keys.forEach((agent) => {

            //     team_monitors[agent.name] = team.monitors.get(agent._id.toString());
            // })
            // console.log(team_monitors);
            const monitors = await MonitorModel.find({ 
                _id: {
                    $in : team.team_monitors_arr
                }
            }, (err, docs) => {
               if(err){
                   return res.json(handle_generated_error(err));
               }
               res.json(handle_success(docs));
            });
            return res.json(handle_success({response: team}));
        });
    } catch (err) {
        // console.log(handle_error({err}));
    }
})



router.use('/monitoring_admins', require("./team_sub_routes/monitoring_admin"));
router.use('/billing_admins', require("./team_sub_routes/billing_admin"));
router.use('/sudoers', require("./team_sub_routes/sudoers_admin"));

module.exports = router;