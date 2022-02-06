const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const MonitorAdminSchema = new Schema({
    email : {
        type : String,  
        required : true,
        // unique : true
    },
    name : {
        type : String,
        required : true,
    },
    offline_time_start : {
        type : String,
        default : "0 22 * * *"
    },
    offline_time_end : {
        type : String,
        default : "0 6 * * *"
    },
    heartbeat : {
        type : Boolean,
        default : false
    },
    send_queued : {
        type : Boolean,
        default : true
    },
    incl_message_body : {
        type : Boolean,
        default : true
    },
    incl_ok : {
        type : Boolean,
        default : true
    },
    incl_warn : {
        type : Boolean,
        default : true
    },
    incl_fail : {
        type : Boolean,
        default : true
    },
    notification_time : {
        type : String,
        default : "0 9 * * *"
    },
    team_id : {
        type : Schema.Types.ObjectId,
        ref : 'Team',
    },
    user_id : {
        type : Schema.Types.ObjectId,
        ref : "User"
    },
    enabled : {
        type : Boolean,
        default : true
    }


}, { versionKey: false })


const MonitorAdminModel = mongoose.model('Monitor Admin', MonitorAdminSchema);

module.exports = MonitorAdminModel;