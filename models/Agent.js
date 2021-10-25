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
    }
    
}, { versionKey: false })



const AgentModel = mongoose.model('Agent', AgentSchema);

module.exports = AgentModel;