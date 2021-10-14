const express = require('express');
const passport = require('passport');   
const jwt = require('jsonwebtoken');


const router = express.Router();


router.post('/register', passport.authenticate('register', {session : false}), async (req, res, next) => {
    res.json({
        message : "Registered successfully!",
        user : req.user
    })
})


router.post('/login', async (req, res, next) => {
    passport.authenticate('login', async (err, user, info) => {
        try {
            if (err || !user) {
                const error = new Error('an error occured.');
                return next(error);
            }

            req.login(user, { session : false }, async (error) => {
                if (error) {
                    return next(error);
                }
                const body = {
                    _id : user._id,
                    email : user.email
                }
                const token = jwt.sign({user : body}, 'iManage-secret-key');
                return res.json({token});
            })
        } catch (err) {
            return next(err);
        }
    })(req, res, next);
})


module.exports = router;