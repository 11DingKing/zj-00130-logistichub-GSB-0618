import { useState } from "react";
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Space,
  Select,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  message,
  Typography,
  Descriptions,
  List,
  Alert,
  Divider,
  Popconfirm,
} from "antd";
import {
  FileTextOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckOutlined,
  StopOutlined,
  PlusOutlined,
  EditOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { leaseAPI, locationAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import {
  STATUS_MAP,
  BILLING_METHOD_MAP,
  formatCurrency,
  formatCapacity,
} from "../../utils/constants";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;

const AdminLeases = () => {
  const [statusFilter, setStatusFilter] = useState();
  const [selectedLease, setSelectedLease] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [tierModalVisible, setTierModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [tierForm] = Form.useForm();

  const {
    data: leases,
    loading,
    run: fetchLeases,
  } = useRequest(() => leaseAPI.getAll({ status: statusFilter }));
  const { data: availableLocations } = useRequest(
    () => locationAPI.getAvailable(),
    false,
  );

  const handleViewLease = async (leaseId) => {
    try {
      const response = await leaseAPI.getById(leaseId);
      setSelectedLease(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error("获取租约详情失败");
    }
  };

  const handleApprove = async (leaseId) => {
    try {
      await leaseAPI.approve(leaseId);
      message.success("租约审核通过");
      fetchLeases();
    } catch (err) {
      message.error(err.response?.data?.error || "审核失败");
    }
  };

  const handleTerminate = async (leaseId) => {
    Modal.confirm({
      title: "确认终止租约",
      content: "终止前请确保该库位下的库存已全部出库。",
      onOk: async () => {
        try {
          await leaseAPI.terminate(leaseId);
          message.success("租约已终止");
          fetchLeases();
        } catch (err) {
          message.error(err.response?.data?.error || "终止失败");
        }
      },
    });
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const priceTiers = values.tiers?.filter(t => t.min !== undefined && t.price !== undefined) || [];
      await leaseAPI.create({
        ...values,
        priceTiers: priceTiers.length > 0 ? priceTiers : null,
        startDate: values.startDate?.format("YYYY-MM-DD"),
        endDate: values.endDate?.format("YYYY-MM-DD"),
      });
      message.success("租约创建成功");
      setCreateModalVisible(false);
      form.resetFields();
      fetchLeases();
    } catch (err) {
      message.error(err.response?.data?.error || "创建失败");
    }
  };

  const handleOpenTierConfig = () => {
    tierForm.setFieldsValue({
      tiers: selectedLease.priceTiers || [{ min: 0, max: 100, price: selectedLease.unit_price }]
    });
    setTierModalVisible(true);
  };

  const handleSaveTiers = async () => {
    try {
      const values = await tierForm.validateFields();
      const validTiers = (values.tiers || []).filter(t => t.min !== undefined && t.price !== undefined);
      await leaseAPI.update(selectedLease.id, { priceTiers: validTiers });
      message.success("阶梯价格已保存");
      setTierModalVisible(false);
      const response = await leaseAPI.getById(selectedLease.id);
      setSelectedLease(response.data);
      fetchLeases();
    } catch (err) {
      message.error(err.response?.data?.error || "保存失败");
    }
  };

  const columns = [
    {
      title: "租约ID",
      dataIndex: "id",
      width: 80,
    },
    {
      title: "商户",
      dataIndex: "merchant_name",
      width: 140,
    },
    {
      title: "库位",
      dataIndex: "location_code",
      width: 120,
    },
    {
      title: "仓库",
      dataIndex: "warehouse_name",
      width: 120,
    },
    {
      title: "存储品类",
      dataIndex: "category_name",
      width: 100,
    },
    {
      title: "约定容量",
      dataIndex: "agreed_capacity",
      width: 100,
      render: (v) => formatCapacity(v),
    },
    {
      title: "计费方式",
      dataIndex: "billing_method",
      width: 110,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{BILLING_METHOD_MAP[v] || v}</span>
          {r.price_tiers && <Tag color="purple" style={{ fontSize: 10 }}>阶梯价</Tag>}
        </Space>
      ),
    },
    {
      title: "单价",
      dataIndex: "unit_price",
      width: 120,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{formatCurrency(v)}/{r.billing_method === "daily" ? "天" : r.billing_method === "monthly" ? "月" : r.billing_method === "per_pallet" ? "托" : "m³"}</span>
        </Space>
      ),
    },
    {
      title: "租期",
      dataIndex: "start_date",
      width: 180,
      render: (v, r) => `${v} ~ ${r.end_date || "长期"}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (v) => {
        const status = STATUS_MAP[v];
        return <Tag color={status?.color}>{status?.text}</Tag>;
      },
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      render: (_, r) => (
        <Space wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewLease(r.id)}
          >
            详情
          </Button>
          {r.status === "pending" && (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleApprove(r.id)}
            >
              审核
            </Button>
          )}
          {r.status === "active" && (
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  handleViewLease(r.id);
                  setTimeout(() => handleOpenTierConfig(), 300);
                }}
              >
                阶梯价
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleTerminate(r.id)}
              >
                终止
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const billingMethodWatch = Form.useWatch("billingMethod", form);
  const showTierConfigInCreate = billingMethodWatch === "per_pallet" || billingMethodWatch === "per_volume";

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>
          租约管理
        </Title>
        <Text type="secondary">管理商户库位租赁申请和租约执行情况</Text>
      </div>

      <Card
        className="card-shadow"
        title="租约列表"
        extra={
          <Space>
            <Select
              placeholder="状态筛选"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              allowClear
            >
              <Option value="pending">待审核</Option>
              <Option value="active">生效中</Option>
              <Option value="expired">已过期</Option>
              <Option value="terminated">已终止</Option>
            </Select>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              新建租约
            </Button>
            <Button icon={<SearchOutlined />} onClick={fetchLeases}>
              刷新
            </Button>
          </Space>
        }
      >
        {leases?.filter((l) => l.status === "pending").length > 0 && (
          <Alert
            message="待审核租约"
            description={`有 ${leases.filter((l) => l.status === "pending").length} 份租约等待审核，请及时处理。`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Table
          columns={columns}
          dataSource={leases}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1500 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条租约`,
          }}
        />
      </Card>

      <Modal
        title="租约详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          selectedLease?.status === "active" ? (
            <Space>
              <Button icon={<EditOutlined />} onClick={handleOpenTierConfig}>
                配置阶梯价格
              </Button>
              <Button onClick={() => setDetailModalVisible(false)}>关闭</Button>
            </Space>
          ) : null
        }
        width={850}
      >
        {selectedLease && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="商户">
                {selectedLease.merchant_name}
              </Descriptions.Item>
              <Descriptions.Item label="商户公司">
                {selectedLease.merchant_company}
              </Descriptions.Item>
              <Descriptions.Item label="联系电话">
                {selectedLease.merchant_phone}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedLease.status]?.color}>
                  {STATUS_MAP[selectedLease.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="库位">
                {selectedLease.location_code}
              </Descriptions.Item>
              <Descriptions.Item label="库位容量">
                {formatCapacity(selectedLease.location_capacity)}
              </Descriptions.Item>
              <Descriptions.Item label="存储品类">
                {selectedLease.category_name}
              </Descriptions.Item>
              <Descriptions.Item label="品类单位">
                {selectedLease.category_unit}
              </Descriptions.Item>
              <Descriptions.Item label="约定容量">
                {formatCapacity(selectedLease.agreed_capacity)}
              </Descriptions.Item>
              <Descriptions.Item label="库位温区">
                {selectedLease.location_temp_zone}
              </Descriptions.Item>
              <Descriptions.Item label="计费方式">
                {BILLING_METHOD_MAP[selectedLease.billing_method]}
              </Descriptions.Item>
              <Descriptions.Item label="基础单价">
                {formatCurrency(selectedLease.unit_price)}
              </Descriptions.Item>
              <Descriptions.Item label="开始日期">
                {selectedLease.start_date}
              </Descriptions.Item>
              <Descriptions.Item label="结束日期">
                {selectedLease.end_date || "长期"}
              </Descriptions.Item>
            </Descriptions>

            {selectedLease.priceTiers && selectedLease.priceTiers.length > 0 && (
              <Card size="small" title="阶梯价格配置" type="inner">
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r, i) => i}
                  dataSource={selectedLease.priceTiers}
                  columns={[
                    { title: '档位', render: (_, r, i) => `第 ${i + 1} 档` },
                    { title: '起始量', dataIndex: 'min' },
                    { title: '上限', dataIndex: 'max', render: v => v || '以上' },
                    { title: '单价 (元)', dataIndex: 'price', render: v => `¥${Number(v).toFixed(2)}` },
                  ]}
                />
              </Card>
            )}

            {selectedLease.inventory?.length > 0 && (
              <Card title="当前库存" size="small" type="inner">
                <List
                  dataSource={selectedLease.inventory}
                  renderItem={(item) => (
                    <List.Item key={item.id}>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text strong>{item.batch_no}</Text>
                            <Tag>{item.category_name}</Tag>
                          </Space>
                        }
                        description={`${item.quantity} ${item.unit} · 入库于 ${item.inbound_date}`}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            )}

            {selectedLease.remarks && (
              <div>
                <Text type="secondary">备注:</Text>
                <div>{selectedLease.remarks}</div>
              </div>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title="配置阶梯价格"
        open={tierModalVisible}
        onOk={handleSaveTiers}
        onCancel={() => setTierModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Alert
          message="累进计费说明"
          description="阶梯计价按累计平均使用量分档计费，每档只对超出部分使用该档单价（类似个税累进计算）。最后一档上限留空表示不限。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={tierForm} layout="vertical">
          <Form.List name="tiers">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      {...field}
                      label={index === 0 ? '档位' : ''}
                      name={[field.name, 'min']}
                      rules={[{ required: true, message: '必填' }]}
                    >
                      <InputNumber min={0} placeholder="起始量" style={{ width: 100 }} addonBefore="≥" />
                    </Form.Item>
                    <span>-</span>
                    <Form.Item
                      {...field}
                      name={[field.name, 'max']}
                    >
                      <InputNumber min={0} placeholder="上限" style={{ width: 100 }} addonBefore="≤" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      label={index === 0 ? '单价 (元)' : ''}
                      name={[field.name, 'price']}
                      rules={[{ required: true, message: '必填' }]}
                    >
                      <InputNumber min={0} step={0.01} style={{ width: 130 }} addonBefore="¥" placeholder="单价" />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined onClick={() => remove(field.name)} style={{ color: '#ff4d4f' }} />
                    )}
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ min: 0, price: 0 })} block icon={<PlusCircleOutlined />}>
                  添加档位
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="新建租约"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        okText="创建"
        width={650}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="merchantId"
                label="商户"
                rules={[{ required: true, message: "请选择商户" }]}
              >
                <Select placeholder="请选择商户">
                  <Option value={2}>鲜达食品有限公司</Option>
                  <Option value={3}>速通快递有限公司</Option>
                  <Option value={4}>康泰医药有限公司</Option>
                  <Option value={5}>恒信电子科技有限公司</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="locationId"
                label="库位"
                rules={[{ required: true, message: "请选择库位" }]}
              >
                <Select placeholder="请选择库位">
                  {availableLocations?.map((loc) => (
                    <Option key={loc.id} value={loc.id}>
                      {loc.code} ({formatCapacity(loc.available_capacity)}可用)
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="categoryId"
                label="存储品类"
                rules={[{ required: true, message: "请选择品类" }]}
              >
                <Select placeholder="请选择品类">
                  <Option value={1}>大米</Option>
                  <Option value={2}>面粉</Option>
                  <Option value={3}>食用油</Option>
                  <Option value={4}>牛奶</Option>
                  <Option value={8}>感冒药片</Option>
                  <Option value={10}>手机电池</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="agreedCapacity"
                label="约定容量 (m³)"
                rules={[{ required: true, message: "请输入约定容量" }]}
              >
                <InputNumber min={0} step={0.1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="billingMethod"
                label="计费方式"
                rules={[{ required: true, message: "请选择计费方式" }]}
              >
                <Select placeholder="请选择计费方式">
                  <Option value="daily">按天计费</Option>
                  <Option value="monthly">按月计费</Option>
                  <Option value="per_pallet">按托盘计费</Option>
                  <Option value="per_volume">按体积计费</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="unitPrice"
                label="基础单价 (元)"
                rules={[{ required: true, message: "请输入单价" }]}
              >
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          {showTierConfigInCreate && (
            <>
              <Divider orientation="left" plain>阶梯价格配置（可选，累进计费）</Divider>
              <Alert
                message="提示"
                description="不配置阶梯时按基础单价统一计费；配置后按累计使用量分档累进计费。"
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
              />
              <Form.List name="tiers">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, index) => (
                      <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                        <Form.Item
                          {...field}
                          label={index === 0 ? '档位区间' : ''}
                          name={[field.name, 'min']}
                          rules={[{ required: true, message: '必填' }]}
                        >
                          <InputNumber min={0} placeholder="起始量" style={{ width: 100 }} />
                        </Form.Item>
                        <span>-</span>
                        <Form.Item
                          {...field}
                          name={[field.name, 'max']}
                        >
                          <InputNumber min={0} placeholder="上限" style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label={index === 0 ? '单价 (元)' : ''}
                          name={[field.name, 'price']}
                          rules={[{ required: true, message: '必填' }]}
                        >
                          <InputNumber min={0} step={0.01} style={{ width: 130 }} addonBefore="¥" />
                        </Form.Item>
                        {fields.length > 0 && (
                          <MinusCircleOutlined onClick={() => remove(field.name)} style={{ color: '#ff4d4f' }} />
                        )}
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ min: 0, price: 0 })} block icon={<PlusCircleOutlined />}>
                      添加阶梯档位
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Form.Item
                name="startDate"
                label="开始日期"
                rules={[{ required: true, message: "请选择开始日期" }]}
              >
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="结束日期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminLeases;
