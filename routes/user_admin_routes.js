const express = require('express');
const { handle_generated_error, not_found, is_root } = require('../helpers/plans');
const router = express.Router();

const verbose = "User";

router.post("/add", (req, res, next) => {
  const data = req.body;
  const user_id = data.user_id;
  const team_id = data.team_id;
  const new_user_id = data.new_user_id;

  TeamModel.findById({ 
        _id : team_id
    }, (err, team) => {
        if(err){
                return res.json(handle_generated_error(err))
        } else{
            if(!team){
                return res.json(not_found("Team"));
            }
        }
        if(
            !(
                is_root(team.root, user_id) ||
            )
        )
    });
})