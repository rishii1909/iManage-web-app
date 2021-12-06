const MonitorModel = require("../models/Monitor");
const TeamModel = require("../models/Team");
const UserModel = require('../models/User');
const NotificationModel = require('../models/Notification');
const { binary_monitors } = require("./plans");

exports.parseDashboardDataResponse = (resp, final_response_object, monitor_type_key) => {
    if(resp.accomplished){
        // console.log("API response : " ,resp.response)
        for (const key in resp.response) {
            if (Object.hasOwnProperty.call(resp.response, key)) {
                const rec = resp.response[key];
                // Adding to level 1 - starts
                if(binary_monitors[monitor_type_key] === true){
                    final_response_object.level_1.two_states[rec._id.monitor_status ? 0 : 1] += rec.count
                }else{
                    final_response_object.level_1.three_states[rec._id.monitor_status] += rec.count
                }
                // Adding to level 1 - ends

                // Adding to level 2 - starts
                let device_category = null;
                if(binary_monitors[monitor_type_key] == true){
                    device_category = "two_states";
                    rec._id.monitor_status = rec._id.monitor_status ? 0 : 1;
                }else{
                    device_category = "three_states";
                }
                if( final_response_object.level_2[device_category][rec._id.device] && final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] ){
                    final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] += rec.count;
                }else{
                    final_response_object.level_2[device_category][rec._id.device] = {
                        [rec._id.monitor_status] : rec.count
                    }
                }
                // Adding to level 2 - ends

                // Adding to level 3 - starts
                if( final_response_object.level_3[rec._id.device] && final_response_object.level_3[rec._id.device][rec._id.monitor_ref] ){
                    final_response_object.level_3[rec._id.device][rec._id.monitor_ref] = {
                        label : rec._id.label,
                        monitor_status : rec._id.monitor_status
                    };
                }else{
                    final_response_object.level_3[rec._id.device] = {
                        [rec._id.monitor_ref] : {
                            label : rec._id.label,
                            monitor_status : rec._id.monitor_status
                        }
                    }
                }
                // final_response_object.level_3[rec._id.device][rec._id.monitor_ref] = {
                //     label : rec._id.label,
                //     monitor_status : rec._id.monitor_status
                // };
                // Adding to level 3 - ends
            }
        }
    }
}

exports.emitNotification = (nf) => {
    console.log("Notification emit event triggered")
    MonitorModel.findOne({
        monitor_ref: nf.monitor_ref,
    }).populate("notification_template").then((monitor) => {
        if (!monitor) {
            return console.log(`[${nf.monitor_ref}] Notification emit error - Monitor not found.`)
        }
        let notif_users = []
        let template = {
            header : monitor.notification_template.header,
            body : monitor.notification_template.body
        }
        console.log(template)
        template.header.replace("<%Monitor%>", nf.monitor_name);
        template.header.replace("<%Status%>", nf.current_monitor_status);
        template.header.replace("<%EventDT%>", nf.event_dt);
        template.header.replace("<%EventMessage%>", nf.alert_verbose);
        template.body.replace("<%Monitor%>", nf.monitor_name);
        template.body.replace("<%Status%>", nf.current_monitor_status);
        template.body.replace("<%EventDT%>", nf.event_dt);
        template.body.replace("<%EventMessage%>", nf.alert_verbose);
        console.log(template)
        notif_users.push(monitor.creator)
        if(monitor.assigned_users && monitor.assigned_users.length > 0){
            notif_users.concat(monitor.assigned_users);
        }
        if(monitor.fromTeam){
            TeamModel.findOne({
                _id: monitor.team_id,
            }).then((team) => {
                if(!team) return console.log(`[${nf.monitor_ref}] Notification emit error - Team not found : ${monitor.team_id}`)
                if(team.sudoers && team.sudoers.length){
                    notif_users.concat(team.sudoers);
                }
                if(team.monitoring_admins && team.monitoring_admins.length){
                    notif_users.concat(team.monitoring_admins);
                }

                pushNotification(notif_users, {...nf, ...template});
            });
        }else{
            pushNotification(notif_users, {...nf, ...template});
        }

    });
}

function pushNotification(users, notification){
    console.log("Pushing notification to users...")
    console.log(users);
    NotificationModel.create(notification, (err, notif) => {
        if(err) console.log(err);
        if(notif){
            UserModel.updateMany({ 
                _id: {
                    $in : users
                }
            }, {
                $push : {
                    notifications : notif._id
                }
            },
            {upsert : true},
            (err) => {
               if(err){
                   console.log(`Notification Push Error: ` + err)
               }
            });
        }
    })
}