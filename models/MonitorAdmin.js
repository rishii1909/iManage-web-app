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
    offline_time_start : String,
    offline_time_end : String,
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
    notification_time : String,
    team_id : {
        type : Schema.Types.ObjectId,
        ref : 'Team',
    },
    user_id : {
        type : Schema.Types.ObjectId,
        ref : "User"
    }


}, { versionKey: false })


const MonitorAdminModel = mongoose.model('Monitor Admin', MonitorAdminSchema);

module.exports = MonitorAdminModel;