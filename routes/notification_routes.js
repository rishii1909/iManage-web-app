const express = require('express');
const passport = require('passport');   
const jwt = require('jsonwebtoken');
const shortid = require('shortid');
const TeamSecretModel = require('../models/TeamSecret');
const { handle_success, handle_error, is_root, no_docs_or_error, not_authenticated, exclusive_root_user_action, not_found, handle_generated_error } = require('../helpers/plans');
const UserModel = require('../models/User');
const NotificationModel = require('../models/Notification');
const TeamModel = require('../models/Team');

const router = express.Router();
const doc_name = "Notification template";
// const create_options = { upsert: true, new : true };

const obtain_rules = (rules) => {
  try {
      return JSON.parse(rules);
  } catch (e) {
      return rules;
  }
}
router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    
    UserModel.findById({ 
        _id : user_id
    })
    .select('notifications')
    .populate('notifications')
    .exec((err, notifs) => {
        if(err) return res.json(handle_generated_error(err))

        if(!notifs) return res.json(not_found("User"));

        return res.json(handle_success(notifs));

        // Making notification rules a JSON Object.
        // console.log(obtain_rules(data.rules));
        

    });
})

router.post('/clear', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    UserModel.findById({ 
        _id : user_id
    })
    .select('notifications')
    .exec((err, user) => {
        if(err) return res.json(handle_generated_error(err))

        if(!user) return res.json(not_found("User"));

        NotificationModel.deleteMany(
            {_id : {
                $in : user.notifications
            }},
            (err, response) => {
                if(err) return res.json(handle_error("Action failed."))
                UserModel.findOneAndUpdate({
                    _id : user_id,
                },
                    {
                        $set : {
                            notifications : []
                        }
                    },
                    (err, response) => {
                        if(err) return res.json(handle_generated_error(err));
                        return res.json(handle_success("Notifications cleared successfully."))
    
                    }
                )
            }
        )

        // Making notification rules a JSON Object.
        // console.log(obtain_rules(data.rules));
        

    });

})

module.exports = router;