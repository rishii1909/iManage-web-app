const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const TeamSecretSchema = new Schema({
    team_id : {
        type : Schema.Types.ObjectId,
        ref : "Team"
    },

    secret : {
        type : String,
        required : true,
    },

    createdAt: { type: Date, expires: '1d', default : Date.now() },

}, { versionKey: false })



const TeamSecretModel = mongoose.model('Team secret', TeamSecretSchema);

module.exports = TeamSecretModel;