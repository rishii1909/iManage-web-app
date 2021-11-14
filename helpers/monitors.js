const { binary_monitors } = require("./plans");

exports.parseDashboardDataResponse = (resp, final_response_object, monitor_type_key) => {
    if(resp.accomplished){
        // console.log("API response : " ,resp.response)
        for (const key in resp.response) {
            if (Object.hasOwnProperty.call(resp.response, key)) {
                const rec = resp.response[key];
                // Adding to level 1 - starts
                if(binary_monitors[monitor_type_key] === true){
                    final_response_object.level_1.two_states[rec._id.monitor_status ? 0 : 1] += rec.count
                }else{
                    final_response_object.level_1.three_states[rec._id.monitor_status] += rec.count
                }
                // Adding to level 1 - ends

                // Adding to level 2 - starts
                let device_category = null;
                if(binary_monitors[monitor_type_key] == true){
                    device_category = "two_states";
                    rec._id.monitor_status = rec._id.monitor_status ? 0 : 1;
                }else{
                    device_category = "three_states";
                }
                if( final_response_object.level_2[device_category][rec._id.device] && final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] ){
                    final_response_object.level_2[device_category][rec._id.device][rec._id.monitor_status] += rec.count;
                }else{
                    final_response_object.level_2[device_category][rec._id.device] = {
                        [rec._id.monitor_status] : rec.count
                    }
                }
                // Adding to level 2 - ends

                // Adding to level 3 - starts
                if( final_response_object.level_3[rec._id.device] && final_response_object.level_3[rec._id.device][rec._id.monitor_ref] ){
                    final_response_object.level_3[rec._id.device][rec._id.monitor_ref] = {
                        label : rec._id.label,
                        monitor_status : rec._id.monitor_status
                    };
                }else{
                    final_response_object.level_3[rec._id.device] = {
                        [rec._id.monitor_ref] : {
                            label : rec._id.label,
                            monitor_status : rec._id.monitor_status
                        }
                    }
                }
                // final_response_object.level_3[rec._id.device][rec._id.monitor_ref] = {
                //     label : rec._id.label,
                //     monitor_status : rec._id.monitor_status
                // };
                // Adding to level 3 - ends
            }
        }
    }
}