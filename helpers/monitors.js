const MonitorModel = require("../models/Monitor");
const TeamModel = require("../models/Team");
const UserModel = require('../models/User');
const NotificationModel = require('../models/Notification');
const { binary_monitors } = require("./plans");
const nodemailer = require("nodemailer");

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
                // device and monitor in response
                if( final_response_object.level_3[rec._id.device] ){
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

exports.parseDashboardDataResponseV2 = (resp, final_response_object, monitor_type_key) => {
    if(resp.accomplished){
        // console.log("API response : " ,resp.response)
        for (const key in resp.response) {
            if (Object.hasOwnProperty.call(resp.response, key)) {
                const rec = resp.response[key];
                // Adding to level 1 - starts
                if(binary_monitors[monitor_type_key] === true){
                    // final_response_object.level_1.two_states[rec._id.monitor_status ? 0 : 1] += rec.count
                    final_response_object.level_1.two_states[rec._id.monitor_status] += rec.count
                }else{
                    final_response_object.level_1.three_states[rec._id.monitor_status] += rec.count
                }
                // Adding to level 1 - ends

                // Adding to level 2 - starts
                let device_category = null;
                if(binary_monitors[monitor_type_key] == true){
                    device_category = "two_states";
                    console.log(rec._id.monitor_status)
                    // rec._id.monitor_status = rec._id.monitor_status ? 0 : 1;
                    rec._id.monitor_status = rec._id.monitor_status;
                    console.log(rec._id)
                }else{
                    device_category = "three_states";
                }
                if( final_response_object.level_2[device_category][rec._id.device]){
                    if(final_response_object.level_2[device_category][rec._id.device].hasOwnProperty(rec._id.monitor_status)){
                        final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] += rec.count;
                    }else{
                        final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] = rec.count;
                    }
                }else{
                    final_response_object.level_2[device_category][rec._id.device] = {
                        [rec._id.monitor_status] : rec.count
                    }
                }
                // Adding to level 2 - ends

                // Adding to level 3 - starts
                // device and monitor in response
                // console.log(device_category)
                if( final_response_object.level_3[device_category][rec._id.device] ){
                    final_response_object.level_3[device_category][rec._id.device][rec._id.monitor_ref] = {
                        label : rec._id.label,
                        monitor_status : rec._id.monitor_status
                    };
                }else{
                    final_response_object.level_3[device_category][rec._id.device] = {
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
            }else{
                console.log('IF STATEMENT FAILED HERE', key)
            }
        }
    }
}
function stats(status, binary){
    if(status == 0) return "OK";
    if(status == 1) return binary ? "Failure" : "Warning";
    if(status == 2) return "Failure"
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
        let notif_header = monitor.notification_template.header;
        let notif_body = monitor.notification_template.body;
        const dont_send_notifs = nf.dont_send_notifs;
        let template = {}
        if(!dont_send_notifs){
            notif_header = notif_header.replace("<%Monitor%>", nf.monitor_name);
            notif_header = notif_header.replace("<%Status%>", stats(nf.current_monitor_status, nf.is_binary));
            notif_header = notif_header.replace("<%EventDT%>", nf.event_dt);
            notif_header = notif_header.replace("<%EventMessage%>", nf.alert_verbose);
            notif_body = notif_body.replace("<%Monitor%>", nf.monitor_name);
            notif_body = notif_body.replace("<%Status%>", stats(nf.current_monitor_status, nf.is_binary));
            notif_body = notif_body.replace("<%EventDT%>", nf.event_dt);
            notif_body = notif_body.replace("<%EventMessage%>", nf.alert_verbose);
            if(nf.top) notif_body = notif_body.replace("<%Top10%>", nf.top);
            else notif_body = notif_body.replace("<%Top10%>", "");
            template = {
                header : notif_header,
                body : notif_body,
                ...(nf.top) && {top : nf.top}
            }
        }
        notif_users.push(monitor.creator)
        // notif_users.push('61b04e920467cf244424bc60')
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

                pushNotification(notif_users, {...nf, ...template, ...{device : monitor.device_id}}, dont_send_notifs);
            });
        }else{
            pushNotification(notif_users, {...nf, ...template, ...{device : monitor.device_id}}, dont_send_notifs);
        }


    });
}

function pushNotification(users, notification, dont_send_notifs){
    console.log("Pushing notification to users...", users)
    NotificationModel.create(notification, (err, notif) => {
        if(err) console.log(err);
        if(notif){

            const device_category = `${notification.is_binary ? "two" : "three"}_states`
            const userManyUpdateObject = {
                ...(!dont_send_notifs) && { $push : {
                    notifications : notif._id,
                }},
                [ `dashboard_level_1.${device_category}.${notification.monitor_ref}` ] : notification.current_monitor_status,
            
                [ `dashboard_level_2.${device_category}.${notification.device}.${notification.monitor_ref}` ] : notification.current_monitor_status,
            
                [ `dashboard_level_3.${device_category}.${notification.device}.${notification.monitor_ref}` ] : {
                    label : notification.monitor_name,
                    monitor_status : notification.current_monitor_status
                },
            }

            // if(!dont_send_notifs){
            //     UserModel.find({_id: { $in : users}}).distinct(
            //         'email', 
            //         async (err, emails) => {

            //             if(err) return console.log(err);
            //             if(!emails) return;
            //             // console.log(notification)
            //             // send mail with defined transport object
            //             let info = await transporter.sendMail({
            //               from: '"iManage Notifications System" <notifications@imanage.host>', // sender address
            //               to: emails, // list of receivers
            //               subject: notification.header, // Subject line
            //               text: notification.body, // plain text body
            //             });
            //             console.log("Notification email sent : %s", info.messageId);
            //     });
            // }

            UserModel.updateMany({
                _id: {
                    $in : users
                }
            },
            userManyUpdateObject,
            {upsert : true},
            (err) => {
               if(err){
                   console.log(`Notification Push Error: ` + err)
               }
            });
        }
    })
}