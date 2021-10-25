const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const UserModel = require('../models/User');
const TeamModel = require('../models/Team');
const TeamSecretModel = require('../models/TeamSecret');
const JWTstrategy = require('passport-jwt').Strategy;
const ExtractJWT = require('passport-jwt').ExtractJwt;

passport.use(
    'register',
    new localStrategy({
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true
    },
    async (req, email, password, done) => {
        try {
            if(!req.body.team_secret){
                var user = await UserModel.create(req.body);
                let teamData = {};
                teamData.name = `${user.name.trim().split(" ")[0]}'s team`;
                teamData.root = user._id;
                teamData.level = 0;
                teamData.capacity = 1;
                teamData.users = {
                    [user._id] : true
                }
                const team = await TeamModel.create(teamData);
                await UserModel.updateOne({ 
                    _id: user._id
                }, {
                    team_id: team._id
                },
                (err) => {
                   if(err){
                       console.log(`Error: ` + err)
                   }
                });

                return done(null, {
                    user : user,
                    team : team
                });
            }else{
                // Using Team secret

                TeamSecretModel.findOne({
                    secret: req.body.team_secret,
                }).then(async (secret) => {
                    if(!secret){
                        console.log(secret);
                        return done("Your team secret is invalid.");
                    }
                    var user = await UserModel.create({...req.body, ...{team_id : secret.team_id}});
                    await TeamModel.findOneAndUpdate({
                        _id: secret.team_id,
                    }, {
                        [`users.${user._id}`]: true,
                    }, (err, team) => {
                        if (err) {
                            console.log(`Error: ` + err)
                        } else {
                            return done(null, {
                                user : user,
                                team : team
                            });
                        }
                    });
                    
                });
            }
            
        } catch (err) {
            console.log(err);
            done(err);
        }
    }
    )
)

passport.use(
    'login',
    new localStrategy(
        {
            usernameField : 'email',
            passwordField : 'password',
        },
        async ( email, password, done) => {
            try {
                const User = await UserModel.findOne({email})
                const valid_password = await User.check_password(password);
                if( !User || !valid_password ){
                    return done(
                        null,
                        false,
                        "Incorrect username or password."
                    );
                }
                return done(
                    null,
                    User,
                    "Logged in successfully!"
                )

            } catch (err) {
                done(err);
            }
        }
    )
)

passport.use(
    new JWTstrategy({
        secretOrKey : 'iManage-secret-key',
        // jwtFromRequest : ExtractJWT.fromUrlQueryParameter('auth_token')
        jwtFromRequest : ExtractJWT.fromAuthHeaderAsBearerToken(),
    },
    async (token, done) => {
        try {
            return done(null, token.user)
        } catch (err) {
            return done(err);
        }
    }
    )
)