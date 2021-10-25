const express = require('express');
const { handle_error, handle_success } = require('../helpers/plans');
const UserModel = require('../models/User');
const router = express.Router();


router.get('/secure_route', (req, res, next) => {
    res.json({
        message : "Secure route accessed.",
        user : req.user,
        token : req.query.auth_token
    })
})

router.post('/users/enumerate/user', async (req, res, next) => {
    const data = req.body;
    const ids_array = JSON.parse(data.user_ids);
    await UserModel.find().where('_id').in(ids_array).select('-password -team').exec((err, resp) => {
        if(err){
            res.json(handle_error(err));
        }else{
            res.json(handle_success(resp))
        }
    });
})



module.exports = router;