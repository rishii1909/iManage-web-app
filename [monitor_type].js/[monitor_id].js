import { PageHeader, Form, Input, Button, Space, message, Select, Checkbox, Breadcrumb, Row, Col, Tabs, List, Slider, Switch, Modal } from "antd"
import styles from "../../device.module.css";

const { Option } = Select;
import Device_dashboard from "../../../Device_dashboard"
import { useState, useEffect } from 'react';
import { secure_axios } from '../../../../../../helpers/auth'
import { useRouter } from "next/router";
import Link from "next/link";
import { snmp, types } from "../../../../../../helpers/devices/dict";
import BreadcrumbItem from "antd/lib/breadcrumb/BreadcrumbItem";
import { capitalizeFirstLetter, monitor_types } from "../../../../../../helpers/format";
import { DownOutlined, PlusOutlined, UpOutlined } from "@ant-design/icons";
import DetailsPanel from "../../../../../../components/monitor_panels";
import { Collapse } from 'antd';
import RightAlignedButtonWrapper from "../../../../../../components/ui/RetentionSchedulePanel";
import RetentionSchedulePanel from "../../../../../../components/monitors/RetentionSchedulePanel";
import NotificationRulesPanel from "../../../../../../components/monitors/NotificationRules";
import NotificationTemplatePanel from "../../../../../../components/monitors/NotificationTemplate";
import UrlMonitorSettings from "../../../../../../components/monitors/settings/url_monitor";
import AssignAdminsPanel from "../../../../../../components/monitors/AssignAdmins";

const { Panel } = Collapse;
const { TabPane } = Tabs;

const dummy_admins = [
    {name : "Admin 1"},
    {name : "Admin 2"},
    {name : "Admin 3"},
]

const monitor_view = () => {
    const router = useRouter();
    const { device_type, device_id, monitor_type, monitor_id } = router.query;
    const [monitor, setMonitor] = useState(monitor_id);
    const [metaData, setMetaData] = useState({});
    const [accordion, setAccordion] = useState(0);
    const [admins_checked, setAdmins_checked] = useState(false);
    var [MonitorSettingsPanel, setMonitorSettingsPanel] = useState(null);
    const [form] = Form.useForm();

    if(typeof window !== 'undefined' && monitor_type){
        console.log(monitor_types);
        if(valid_monitors.includes(monitor_type)){
            let MonitorSettingsPanel = dynamic(() => import(`../../../../../../components/monitors/settings/${monitor_type}`));
            setMonitorSettingsPanel(MonitorSettingsPanel);
        }else{
            if( typeof monitor_type !== 'undefined' && typeof window !== 'undefined') router.push('/404')
        }
    }

    useEffect(async () => {
        if(monitor_id){
            const loading = message.loading("Fetching monitor data...");
            await secure_axios(`/monitors/enumerate/monitor`, {monitor_id : monitor_id}, router, (response) => {
                console.log(response)
                const data = response.response
                if(response.accomplished){
                    console.log("monitor : ", data);
                    setMonitor(data.monitors);
                    form.setFieldsValue(data.metadata);
                    const monitor_type = data.metadata.type;
                }else{
                    message.error(data.message ? data.message : data )
                }
                if(data.metadata){
                    delete data.metadata.agent_id;
                    setMetaData(data.metadata);
                    console.log(data.metadata)
                    form.setFieldsValue(data.metadata);
                }
                loading();
            })
        }
    }, [monitor_id]);

    const delete_device = async () => {
        const loading = message.loading("Deleting device...", 0);
        await secure_axios(`/devices/delete/${"device_type"}`, {device_id : 'device_id'}, router, (response) => {
            if(response.accomplished){
                message.success("Device deleted successfully!").then(()=> router.push(`/dashboard/devices?device_tab=${"device_type"}`));
            }else{
                message.error(response.response.message ? response.response.message : response.response )
                // loading.then(() => {
                // })
            }
            loading();
        })
        
    }

    const reset = () => {
        let auth_data = null;
        if(device.password) auth_data = 0;
        if(device.privateKey) auth_data = 1;
        handleAuth(auth_data);
        device.snmp = snmp[device.snmp];
        device.type = types[device.type];
        form.setFieldsValue(device);
    }

    const on_finish = async (data) => {
        console.log(data);
        const loading = message.loading("Creating device...", 0);
        await secure_axios(`/devices/create/${deviceType}`, data, router, (response) => {
            if(response.accomplished){
                // message.success("Device created successfully!").then(()=> router.push('/dashboard/devices'));
                // loading.then(() => {
                // })
                // Router.push('/dashboard/devices')
            }else{
                message.error(response.response.message ? response.response.message : response.response )
                // loading.then(() => {
                // })
            }
            loading();
        })
        
    }

    const on_finish_failed = () => {
        message.error('Submit failed!');
    };
    
    const on_fill = () => {
        form.setFieldsValue({
            url: 'https://taobao.com/',
        });
    };

    const [auth, setAuth] = useState(null);
    const [passphrase, setpassphrase] = useState(false);

    function handleAuth(choice) {
        form.setFieldsValue({auth_method : choice});
        if(choice != 1){
            form.setFieldsValue({ passphrase : null, private_key : null })
        }
        setAuth(choice);
    }

    const layout = {
        labelCol: { offset : 1, span: 4},
        wrapperCol: { offset: 4, span: 10 },
      };
      const tailLayout = {
        wrapperCol: { offset: 16, span : 4 },
      };


    return (
        <Device_dashboard subdomain='Add Device'>
            <Breadcrumb>
                <Breadcrumb.Item>Dashboard</Breadcrumb.Item>
                <Breadcrumb.Item>
                    <Link href={`/dashboard/devices?device_tab=${"device_type"}`}>Devices</Link>
                </Breadcrumb.Item>
                <BreadcrumbItem>{capitalizeFirstLetter("device_type")}</BreadcrumbItem>
                {/* <Breadcrumb.Item>{device && device.name ? device.name : ""}</Breadcrumb.Item> */}
            </Breadcrumb>
            
            <Tabs>
                <TabPane tab="Monitor" key="monitor">
                    {/* <Link href={`/dashboard/devices/${"device_type"}/${device_id}/monitors/add`}>
                      <Button type="primary" icon={<PlusOutlined/>} >
                        Add a monitor
                      </Button>
                    </Link>
                    <br></br>
                    <br></br> */}
                    <Form
                        form={form}
                        preserve={false}
                        colon={false}
                        {...layout}
                        layout='horizontal'
                        onFinish={on_finish}
                        onFinishFailed={on_finish_failed}
                        autoComplete='off'
                        labelAlign="left"
                        labelCol={{span: 5}}
                        requiredMark={false}
                        // onFieldsChange={(fields)=>console.log(fields)}
                        style={{
                            display: 'flex',
                            justifyContent : 'center',
                            flexFlow : 'column'
                        }}
                    >
                        <Collapse defaultActiveKey={accordion}>
                            <Panel forceRender header="Details" key={0}>
                                { (device_type && device) && 
                                <DetailsPanel 
                                device_type={device_type} 
                                monitor_type={monitor_type ? monitor_types[monitor_type] : ""}
                                device_name={device && device.name}
                                agentCallback={setAgent_id}
                                >
                                </DetailsPanel> }
                                <RightAlignedButtonWrapper>
                                    {/* <Button type="primary" icon={<DownOutlined/>} onClick={()=>setAccordion([0,1])}>Next</Button> */}
                                </RightAlignedButtonWrapper>
                            </Panel>
                            <Panel forceRender header="Settings" key={1}>
                                {MonitorSettingsPanel && 
                                    <MonitorSettingsPanel
                                        hostname={device ? device.host : ""}
                                        device_id={device_id}
                                        device_type={device_type} 
                                        monitor_type={monitor_type ? monitor_types[monitor_type] : ""}
                                        device_name={device && device.name}
                                        agent_id={agent_id}
                                        form={form}
                                    />
                                }
                                <RightAlignedButtonWrapper>
                                    {/* <Button icon={<UpOutlined/>} onClick={()=>setAccordion(0)}>Previous</Button> */}
                                    {/* <Button type="primary" icon={<DownOutlined/>} onClick={()=>setAccordion([0,1,2])}>Next</Button> */}
                                </RightAlignedButtonWrapper>
                            </Panel>
                            <Panel forceRender header="Retention Schedule" key={2}>
                                <RetentionSchedulePanel/>
                                <RightAlignedButtonWrapper>
                                    {/* <Button icon={<UpOutlined/>} onClick={()=>setAccordion(1)}>Previous</Button> */}
                                    {/* <Button type="primary" icon={<DownOutlined/>} onClick={()=>setAccordion()}>Next</Button> */}
                                </RightAlignedButtonWrapper>
                            </Panel>
                            <Panel forceRender header="Notification Template" key={3}>
                                <NotificationTemplatePanel/>
                                <RightAlignedButtonWrapper>
                                    {/* <Button icon={<UpOutlined/>} onClick={()=>setAccordion(2)}>Previous</Button> */}
                                    {/* <Button type="primary" icon={<DownOutlined/>} onClick={()=>setAccordion(4)}>Next</Button> */}
                                </RightAlignedButtonWrapper>
                            </Panel>
                            <Panel forceRender header="Notification Rules" key={4}>
                                <NotificationRulesPanel form={form} />
                                <RightAlignedButtonWrapper>
                                    {/* <Button icon={<UpOutlined/>} onClick={()=>setAccordion(3)}>Previous</Button> */}
                                    {/* <Button type="primary" icon={<DownOutlined/>} onClick={()=>setAccordion(5)}>Next</Button> */}
                                </RightAlignedButtonWrapper>
                            </Panel>
                            <Panel forceRender header="Assign Admins" key={5}>
                                <RightAlignedButtonWrapper>
                                    {/* <Switch checkedChildren="Assigned" unCheckedChildren="All" onChange={(e)=> setAdmins_checked(e)} checked={admins_checked}></Switch> */}
                                </RightAlignedButtonWrapper>

                                <AssignAdminsPanel form={form} />

                                <RightAlignedButtonWrapper>
                                    {/* <Button icon={<UpOutlined/>} onClick={()=>setAccordion(4)}>Previous</Button> */}
                                    {/* <Button type="primary" icon={<DownOutlined/>} onClick={()=>setAccordion(5)}>Next</Button> */}
                                </RightAlignedButtonWrapper>
                            </Panel>
                        </Collapse>
                        <Divider/>
                        <RightAlignedButtonWrapper>
                            <Button type="primary" htmlType="submit" icon={<PlusSquareFilled/>}> Create Monitor</Button>
                        </RightAlignedButtonWrapper>
                    </Form>
                </TabPane>

            </Tabs>
            
        </Device_dashboard>
    )
}   


export default monitor_view