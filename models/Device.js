const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const DeviceSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    team_id : {
        type : Schema.Types.ObjectId,
        ref : 'Team',
        required : true
    },
    snmp : {
        type : Number,
        required : true,
    },
    type : {
        type : Number,
        required : true,
        default : 1
    },
    username : {
        type : String,
        required : true,
    },
    host : {
        type : String,
        required : true,
    },
    creds : {
        type : Map,
        required : true
    },
    monitors : {
        type : Map,
        default : {}
    },
    agent : {
        type : Schema.Types.ObjectId,
        ref : 'Agent'
    }
    
}, { versionKey: false })



const DeviceModel = mongoose.model('Device', DeviceSchema);

module.exports = DeviceModel;