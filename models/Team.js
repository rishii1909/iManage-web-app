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
    devices : {
        type : Map,
        default : {}
    },
    user_devices : {
        type : Map,
        default : {},
    },
    user_monitors : {
        type : Map,
        default : {},
    },
    device_occupancy : {
        type : Number,
        default : 0,
    },
    monitor_occupancy : {
        type : Number,
        default : 0,
    },
    agent_occupancy : {
        type : Number,
        default : 0,
    },
    assigned_devices : {
        type : Map,
        default : {},
    },
    assigned_monitors : {
        type : Map,
        default : {},
    },
    agents : {
        type : Map,
        default : {}
    },
    billing_admins : {
        type : Map,
        default : {},
    },
    user_admins : {
        type : Map,
        default : {}
    },
    monitor_admins : {
        type : Map,
        default : {},
    },
    device_admins : {
        type : Map,
        default : {},
    },
    notification_templates : {
        type : Map,
        default : {},
    },
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