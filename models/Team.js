const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const TeamSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    root : {
        type : Schema.Types.ObjectId,
        ref : 'User',
        required : true,
    },
    referral : {
        type : String,
    },
    level : {
        type : Number,
        default : 0
    },
    users : {
        type : Array,
        default : []
    },
    devices : { // team objects go here
        type : Array,
        default : []
    },
    monitors : {
        type : Map,
        default : {}
    },  
    agents : { // team objects go here
        type : Array,
        default : []
    },
    user_devices : { // user object go here
        type : Map,
        default : {},
    },
    user_monitors : { // user object go here
        type : Map,
        default : {},
    },
    user_monitors_arr : { // user object go here
        type : Map,
        default : {},
    },
    team_monitors_arr : { // user object go here
        type : Array,
        default : [],
    },
    user_agents : { // user object go here
        type : Map,
        default : {},
    },
    assigned_devices : { // Object of users, non-nested. store actual per-user map in user object itself.
        type : Map,
        default : {},
    },
    assigned_monitors : { // Object of users, non-nested. store actual per-user map in user object itself.
        type : Map,
        default : {},
    },
    device_occupancy : { // all occupancy counts between any object increments | decrements
        type : Number,
        default : 0,
    },
    monitor_occupancy : { // all occupancy counts between any object increments | decrements
        type : Number,
        default : 0,
    },
    agent_occupancy : { // all occupancy counts between any object increments | decrements
        type : Number,
        default : 0,
    },
    user_occupancy : { // all occupancy counts between any object increments | decrements
        type : Number,
        default : 0,
    },
    sudoers : [{
        type : mongoose.Schema.ObjectId,
        ref : "User",
    }],
    billing_admins : [{
        type : mongoose.Schema.ObjectId,
        ref : "User",
    }],
    user_admins : [{
        type : mongoose.Schema.ObjectId,
        ref : "User",
    }],
    monitoring_admins : [{
        type : mongoose.Schema.ObjectId,
        ref : "User",
    }],
    notification_templates : { // maybe maybe not
        type : Map,
        default : {},
    },
    device_groups : [{
        type : mongoose.Schema.ObjectId,
        ref : "DeviceGroup",
    }],
    analytic_groups : [{
        type : mongoose.Schema.ObjectId,
        ref : "MonitorGroup",
    }],
}, { versionKey: false })


TeamSchema.methods.vacancy = async function(){
  const team = this;
  return {
      current : Object.keys(team).length,
      total : team.capacity,
  };
}

const TeamModel = mongoose.model('Team', TeamSchema);

module.exports = TeamModel;