const express = require('express');
const passport = require('passport');   
const jwt = require('jsonwebtoken');
const { handle_success, handle_error } = require('../helpers/plans');


const router = express.Router();


router.post('/register', passport.authenticate('register', {session : false}), async (req, res, next) => {
    res.json(handle_success("Registered successfully!"))
})

router.post('/login', async (req, res, next) => {
    passport.authenticate('login', async (err, user, info) => {
        try {
            if (err || !user) {
                return res.json(handle_error(info));
            }
            req.login(user, { session : false }, async (error) => {
                if (error) {
                    return res.json(handle_error(error));
                }
                const token = jwt.sign({user : user._id}, 'iManage-secret-key', {expiresIn : '1d'});
                return res.json(handle_success(
                    {
                            user_id : user._id,
                            team_id : user.team_id,
                            name : user.name,
                            pro : user.pro,
                            auth_token : token,
                            message : info
                    }
                ));
            })
        } catch (err) {
            return next(err);
        }
    })(req, res, next);
})

module.exports = router;