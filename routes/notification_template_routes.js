const express = require('express');
const passport = require('passport');   
const jwt = require('jsonwebtoken');
const shortid = require('shortid');
const TeamSecretModel = require('../models/TeamSecret');
const { handle_success, handle_error, is_root, no_docs_or_error, not_authenticated, exclusive_root_user_action, not_found, handle_generated_error } = require('../helpers/plans');
const UserModel = require('../models/User');
const NotificationTemplateModel = require('../models/NotificationTemplate');
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
router.post('/create', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;
    
    UserModel.findById({ 
        _id : user_id
    }, async (err, doc) => {
        if(err) return res.json(handle_generated_error(err))

        if(!doc) return res.json(not_found("User"));

        // Making notification rules a JSON Object.
        // console.log(obtain_rules(data.rules));
        if(data.rules) data.rules = obtain_rules(data.rules);

        try {
            const template = await NotificationTemplateModel.create(data);
            if(!template){
                return res.json(handle_error("There was error while creating the notification template."))
            }

            UserModel.findOneAndUpdate({
                _id: user_id,
            }, {
                $push : {[`notification_templates`] : template._id.toString()},
            }, (err, doc) => {
                const invalid = no_docs_or_error(doc, err);
                if(invalid.is_true){
                    return res.json(invalid.message);
                }

                return res.json(handle_success(template));
            });
        } catch (err) {
            console.log(err);
            res.json(handle_error(err.message))
        }


    });
})
// Ignore for now
router.post('/create/user', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;

    const template = await NotificationTemplateModel.create(data);
    if(!template){
        return res.json(handle_error("There was error while creating the notification template."))
    }

    UserModel.findOneAndUpdate({
        _id: user_id,
    }, {
        [`notification_templates.${template._id}`]: true,
    }, (err, doc) => {
        if(!doc || err){
            return res.json(handle_error("The notification template could not be added to your account."))
        }

        return res.json(handle_success("Notification template created successfully!"))
    });
})

router.post('/enumerate', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    UserModel.findById({ 
        _id : user_id
    }, (err, doc) => {

        if(err) return res.json(handle_generated_error(err))
        if(!doc) return res.json(not_found("User"))
        console.log(doc.notification_templates)
        NotificationTemplateModel.find({ 
            _id: {
                $in : doc.notification_templates
            }
        }, (err, notifs) => {
            if(err) return res.json(handle_generated_error(err))
            if(!notifs) return res.json(not_found("Notification templates"))

           return res.json(handle_success(notifs))
        });


    });
})

router.post('/enumerate/notif', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const notif_id = data.notif_id;
    NotificationTemplateModel.find({ 
        _id: notif_id
    }, (err, notif) => {
        if(err) return res.json(handle_generated_error(err))
        if(!notif) return res.json(not_found("Notification templates"))

       return res.json(handle_success(notif))
    });
})
// Ignore for now
router.post('/enumerate/team', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const team_id = data.team_id;

    try {
        TeamModel.findOne({
            _id: team_id
        })
        .select("_id notification_templates")
        .then((team) => {
            if (!team) {
                return res.json(not_found("Team"));
            }

            return res.json(handle_success(team.notification_templates))
        });
    } catch (err) {
        console.log(err);
        return res.json(handle_error(err));
    }
})

router.post('/delete', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const notif_id = data.notif_id;

    NotificationTemplateModel.findOneAndDelete({ 
        _id: notif_id
    }, (err, notif) => {
        if(no_docs_or_error(notif, err).is_true) return res.json(not_found("Notification template"));

        UserModel.findOneAndUpdate({
            _id: user_id,
        }, {
            $pull: {
                notification_templates : {_id : notif_id}
            },
        }, (err, doc) => {
            if(no_docs_or_error(doc, err).is_true) console.log(err, doc);

            return res.json(handle_success({ ...{message : "Notification template deleted successfully!"} , ...(notif.toObject()) }))
        });

    });
})

router.post('/update', async (req, res, next) => {
    const data = req.body;
    const user_id = data.user_id;
    const notif_id = data.notif_id;
    
    NotificationTemplateModel.findOneAndUpdate({
        _id: notif_id,
    }, 
    data, 
    {new :  true},
    (err, doc) => {
        console.log(err, doc);
        if(no_docs_or_error(doc, err).is_true) return res.json(not_found(doc_name));

        return res.json(handle_success({
            ...{message : doc_name + " updated successfully!"},
            doc
        }))

    });
})


module.exports = router;