const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const AgentSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    private : {
        type :Boolean,
        required : false,
        default : false
    },
    api_url : {
        type : String,
        required : true,
    },
    additional_info : {
        type : String,
        required : false,
    },
    team_id : {
        type : Schema.Types.ObjectId,
        ref : 'Team',
        required : true
    },
    type : {
        type : Number,
        required : true,
        default : 1
    },
    
}, { versionKey: false })



const AgentModel = mongoose.model('Agent', AgentSchema);

module.exports = AgentModel;