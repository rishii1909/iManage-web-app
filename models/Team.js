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
        type : Map,
    },
    devices : { // team objects go here
        type : Array,
        default : {}
    },
    monitors : { // team objects go here
        type : Array,
        default : {}
    },
    agents : { // team objects go here
        type : Array,
        default : {}
    },
    user_devices : { // user object go here
        type : Map,
        default : [],
    },
    user_monitors : { // user object go here
        type : Map,
        default : [],
    },
    user_agents : { // user object go here
        type : Map,
        default : [],
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
    billing_admins : { // admins
        type : Map,
        default : {},
    },
    user_admins : { // admins
        type : Map,
        default : {}
    },
    monitoring_admins : { // admins
        type : Map,
        default : {},
    },
    notification_templates : { // maybe maybe not
        type : Map,
        default : {},
    },
    device_groups : { // monitoring groups present in the team, 
        type : Map,
        default : {}
    },
    analytic_groups : { // monitoring groups present in the team, 
        type : Map,
        default : {}
    }
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