const url = require('url');
const dns = require('dns');
const AgentModel = require('../models/Agent');

AGENTS = {};

// exports.newAgent = (request, websocket) => {
//     const url_input = url.parse(request.url, true);
//     AGENTS[url_input.query.ip_address + ":3031"] = websocket;
//     console.log(url_input.query.ip_address + ":3031");

// }

// exports.newAgent = (agent_id, websocket) => {
//   AgentModel.findOne({
//       _id: agent_id,
//   }).then((agent) => {
//       if(agent){
        
//       }
//   });
// }

exports.newAgent = (request, websocket) => {
    const url_input = url.parse(request.url, true);
    const agent_id = url_input.query.agent_id;
    if(!agent_id) return console.log("No agent ID provided, so not adding the websocket to the registry.")
    AGENTS[agent_id] = websocket;
    console.log("Agent added to websocket : " + agent_id);
}

exports.removeAgent = (request) => {
    const url_input = url.parse(request.url, true);
    const agent_id = url_input.query.agent_id;
    if(!AGENTS[agent_id]) return console.log("Agent not found to delete : " + agent_id)
    delete AGENTS[agent_id];
    console.log("Agent removed : " + agent_id);
}

exports.fetchWebSocket = (agent_id) => {
    
    return AGENTS[agent_id] ? AGENTS[agent_id] : false; 
}