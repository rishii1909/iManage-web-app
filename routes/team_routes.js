const express = require('express');

const TeamModel = require('../models/Team');
const { handle_success, handle_error, is_root, no_docs_or_error } = require('../helpers/plans');

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
        await TeamModel.findById({_id : data.team_id}, (err, response) => {
            const invalid = no_docs_or_error(response, err);
            if(invalid.is_true){
                console.log(err, response)
                return res.json(invalid.message);
            }
            return res.json(handle_success({response}));
        });
    } catch (err) {
        // console.log(handle_error({err}));
    }
})


router.use('/device_admin', require("./team_sub_routes/device_admin"));

module.exports = router;