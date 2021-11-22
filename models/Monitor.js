const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const RetentionSchema = new Schema({
    raw_data : Number,
    daily_aggr : Number,
    weekly_aggr : Number,
    monthly_aggr : Number,
    export : String
})
const OfflineSchema = new Schema({
    offline_time_1 : String,
    offline_time_2 : String,
})
const AlertRulesSchema = new Schema({
    alert_type : String,
    alert_count : Number,
})
const NotificationRuleSchema = new Schema({
    alert_all : Boolean,
    alert_rules : [AlertRulesSchema],
})

const MonitorSchema = new Schema({
    agent_id : {
        type : Schema.Types.ObjectId,
        ref : 'Agent',
        required : false,
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
    offline_times : OfflineSchema,
    notification_template : {
        type : Schema.Types.ObjectId,
    },
    assigned_users : {
        type : Array,
        default : [],
    },
    retention_schedule : RetentionSchema,
    notification_rules : NotificationRuleSchema,

}, { versionKey: false })



const MonitorModel = mongoose.model('Monitor', MonitorSchema);

module.exports = MonitorModel;
