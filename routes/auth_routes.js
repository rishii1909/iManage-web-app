const express = require('express');
const passport = require('passport');   
const jwt = require('jsonwebtoken');
const { handle_success, handle_error, handle_generated_error, not_found } = require('../helpers/plans');
const nodemailer = require("nodemailer");
const { nanoid } = require("nanoid");
const UserModel = require('../models/User');

const router = express.Router();

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

let transporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: "notifications@imanage.host", 
      pass: "Reset123!",
    },
});


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

router.post('/forgot_password', async (req, res, next) => {
    const data = req.body;
    const email = data.email;
    const new_password = nanoid();
    UserModel.findOneAndUpdate({ 
        email: email
    }, {
        password: new_password
    },
    {new : true},
    async (err, user) => {
        // console.log(err, user)
        if (err) {
            return res.json(handle_generated_error(err));
        }
        if(!user) return res.json(not_found("Account"));

        try {
            const mailed = await transporter.sendMail({
                from: '"iManage Accounts System" <notifications@imanage.host>', // sender address
                to: email, // list of receivers
                subject: "Password reset", // Subject line
                text: "Your reset password is : " + new_password, // plain text body
            });
            
            if(mailed) return res.json(handle_success("A temporary password has been sent to your account, please log in using that and reset your password."));
            return res.json(handle_error("Unable to send reset password to your email."))

        } catch (err) {
            return res.json(handle_generated_error(err));
        }

    });
    
    // UserModel.findOne({
    //     email: email,
    // }).then((user) => {
    //     if(!user) return res.json(handle_error(not_found("Account")))

    //     // send mail with defined transport object
    //     transporter.sendMail({
    //         from: '"iManage Notifications System" <notifications@imanage.host>', // sender address
    //         to: emails, // list of receivers
    //         subject: notification.header, // Subject line
    //         text: notification.body, // plain text body
    //     });
    // });
})

module.exports = router;