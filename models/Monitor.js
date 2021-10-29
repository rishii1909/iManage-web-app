const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const MonitorSchema = new Schema({
    agent_id : {
        type : Schema.Types.ObjectId,
        required : true,
    },
    device_id : {
        type : Schema.Types.ObjectId,
        required : true,
    },
    label : {
        type : String,
        required : true,
    },
    monitor_ref : {
        type : String,
        required : true
    },
    type : {
        type : String,
        required : true
    },
    offline_time : {
        type : String,
        required : false
    },
    notification_template : {
        type : Schema.Types.ObjectId,
        required : true,
    }
}, { versionKey: false })



const MonitorModel = mongoose.model('Monitor', MonitorSchema);

module.exports = MonitorModel;
