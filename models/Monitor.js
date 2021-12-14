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
    offline_time_1_start : String,
    offline_time_1_stop : String,
    offline_time_2_start : String,
    offline_time_2_stop : String,
})
const AlertRulesSchema = new Schema({
    alert_type : String,
    alert_count : Number,
})
const NotificationRuleSchema = new Schema({
    alert_all : Boolean,
    alert_rules : Schema.Types.Mixed,
})

const MonitorSchema = new Schema({
    agent_id : {
        type : Schema.Types.ObjectId,
        ref : 'Agent',
        // required : true,
    },
    team_id : {
        type : Schema.Types.ObjectId,
        ref : 'Team',
        required : true
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
        required : false
    },
    type : {
        type : String,
        required : true
    },
    offline_times : OfflineSchema,
    notification_template : {
        type : Schema.Types.ObjectId,
        ref : "Notification template"
    },
    assigned_users : [{
        type : mongoose.Schema.ObjectId,
        ref : "User",
    }],
    creator : {
        type : mongoose.Schema.ObjectId,
        ref : "User"
    },
    fromTeam : {
        type : Boolean,
        default : false
    },
    raw_data : Number,
    daily_aggr : Number,
    weekly_aggr : Number,
    monthly_aggr : Number,
    retsch_export : String,
    // retention_schedule : RetentionSchema,
    notification_rules : NotificationRuleSchema,
    additional_info : mongoose.Schema.Types.Mixed

}, { versionKey: false })



const MonitorModel = mongoose.model('Monitor', MonitorSchema);

module.exports = MonitorModel;
