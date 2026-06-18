import { useState } from "react";
import {
  Row,
  Col,
  Divider,
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
} from "antd";
import {
  InboxOutlined,
  SearchOutlined,
  EyeOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { inboundAPI, warehouseAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import { STATUS_MAP } from "../../utils/constants";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;

const MerchantInbound = () => {
  const [statusFilter, setStatusFilter] = useState();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [items, setItems] = useState([{ id: Date.now() }]);

  const {
    data: orders,
    loading,
    run: fetchOrders,
  } = useRequest(() => inboundAPI.getMyOrders());
  const { data: warehouses } = useRequest(() =>
    warehouseAPI.getAll({ status: "active" }),
  );

  const handleViewOrder = async (orderId) => {
    try {
      const response = await inboundAPI.getById(orderId);
      setSelectedOrder(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error("获取入库单详情失败");
    }
  };

  const handleAddItem = () => {
    setItems([...items, { id: Date.now() }]);
  };

  const handleRemoveItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();

      const itemsData = items.map((item, idx) => ({
        categoryId: values[`category_${item.id}`],
        plannedQuantity: values[`quantity_${item.id}`],
        unit: values[`unit_${item.id}`] || "件",
        unitVolume: values[`volume_${item.id}`],
        productionDate: values[`prodDate_${item.id}`]?.format("YYYY-MM-DD"),
        expiryDate: values[`expDate_${item.id}`]?.format("YYYY-MM-DD"),
        batchNo: values[`batchNo_${item.id}`],
      }));

      const orderData = {
        warehouseId: values.warehouseId,
        arrivalDate: values.arrivalDate?.format("YYYY-MM-DD"),
        contactPerson: values.contactPerson,
        contactPhone: values.contactPhone,
        remarks: values.remarks,
        items: itemsData,
      };

      await inboundAPI.create(orderData);
      message.success("入库申请提交成功");
      setCreateModalVisible(false);
      form.resetFields();
      setItems([{ id: Date.now() }]);
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || "提交失败");
    }
  };

  const columns = [
    {
      title: "入库单号",
      dataIndex: "order_no",
      width: 160,
      render: (v, r) => (
        <a onClick={() => handleViewOrder(r.id)} style={{ fontWeight: 500 }}>
          {v}
        </a>
      ),
    },
    {
      title: "仓库",
      dataIndex: "warehouse_name",
      width: 140,
    },
    {
      title: "总数量",
      dataIndex: "total_quantity",
      width: 100,
    },
    {
      title: "项数",
      dataIndex: "item_count",
      width: 80,
    },
    {
      title: "到货日期",
      dataIndex: "arrival_date",
      width: 120,
      render: (v) => (v ? dayjs(v).format("YYYY-MM-DD") : "-"),
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
      title: "创建时间",
      dataIndex: "created_at",
      width: 160,
      render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewOrder(r.id)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>
          入库申请
        </Title>
        <Text type="secondary">提交和管理您的入库订单</Text>
      </div>

      <Card
        className="card-shadow"
        title="入库单列表"
        extra={
          <Space>
            <Select
              placeholder="状态筛选"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              allowClear
            >
              <Option value="pending">待处理</Option>
              <Option value="checking">验货中</Option>
              <Option value="putaway">上架中</Option>
              <Option value="completed">已完成</Option>
            </Select>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              新建入库
            </Button>
            <Button icon={<SearchOutlined />} onClick={fetchOrders}>
              刷新
            </Button>
          </Space>
        }
      >
        <Alert
          message="入库流程"
          description="1. 提交入库申请 → 2. 仓管验货 → 3. 仓管上架 → 4. 入库完成。您可以在此页面跟踪入库进度。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Table
          columns={columns}
          dataSource={orders}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条入库单`,
          }}
        />
      </Card>

      <Modal
        title="入库单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedOrder && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="入库单号">
                {selectedOrder.order_no}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedOrder.status]?.color}>
                  {STATUS_MAP[selectedOrder.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="仓库">
                {selectedOrder.warehouse_name}
              </Descriptions.Item>
              <Descriptions.Item label="总数量">
                {selectedOrder.total_quantity}
              </Descriptions.Item>
              <Descriptions.Item label="联系人">
                {selectedOrder.contact_person}
              </Descriptions.Item>
              <Descriptions.Item label="联系电话">
                {selectedOrder.contact_phone}
              </Descriptions.Item>
              <Descriptions.Item label="到货日期">
                {selectedOrder.arrival_date}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(selectedOrder.created_at).format("YYYY-MM-DD HH:mm")}
              </Descriptions.Item>
            </Descriptions>

            <Card title="入库明细" size="small" type="inner">
              <List
                dataSource={selectedOrder.items}
                renderItem={(item, idx) => (
                  <List.Item key={item.id}>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>
                            {idx + 1}. {item.category_name}
                          </Text>
                          <Tag color="blue">{item.batch_no}</Tag>
                          <Tag color={STATUS_MAP[item.status]?.color}>
                            {STATUS_MAP[item.status]?.text}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space>
                          <span>
                            计划: {item.planned_quantity} {item.unit}
                          </span>
                          <span>
                            实际: {item.actual_quantity || "-"} {item.unit}
                          </span>
                          {item.location_code && (
                            <span>库位: {item.location_code}</span>
                          )}
                          {item.expiry_date && (
                            <span type="warning">
                              保质期至: {item.expiry_date}
                            </span>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        )}
      </Modal>

      <Modal
        title="新建入库申请"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
          setItems([{ id: Date.now() }]);
        }}
        okText="提交申请"
        width={800}
      >
        <Alert
          message="注意事项"
          description="请确保所选仓库有您的有效租约，否则无法入库。有保质期的商品请如实填写生产日期和过期日期。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="warehouseId"
                label="入库仓库"
                rules={[{ required: true, message: "请选择入库仓库" }]}
              >
                <Select placeholder="请选择仓库">
                  {warehouses?.map((wh) => (
                    <Option key={wh.id} value={wh.id}>
                      {wh.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="arrivalDate"
                label="预计到货日期"
                rules={[{ required: true, message: "请选择到货日期" }]}
              >
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="contactPerson"
                label="联系人"
                rules={[{ required: true, message: "请输入联系人" }]}
              >
                <Input placeholder="请输入联系人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="contactPhone"
                label="联系电话"
                rules={[{ required: true, message: "请输入联系电话" }]}
              >
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">入库商品明细</Divider>

          {items.map((item, idx) => (
            <Card
              key={item.id}
              size="small"
              title={
                <Space>
                  <Text strong>商品 {idx + 1}</Text>
                  {items.length > 1 && (
                    <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      删除
                    </Button>
                  )}
                </Space>
              }
              style={{ marginBottom: 12 }}
            >
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name={`category_${item.id}`}
                    label="货物品类"
                    rules={[{ required: true, message: "请选择品类" }]}
                    style={{ marginBottom: 8 }}
                  >
                    <Select placeholder="请选择品类">
                      <Option value={1}>大米 (袋)</Option>
                      <Option value={2}>面粉 (袋)</Option>
                      <Option value={3}>食用油 (桶)</Option>
                      <Option value={4}>牛奶 (箱)</Option>
                      <Option value={5}>鲜肉 (公斤)</Option>
                      <Option value={6}>速冻水饺 (箱)</Option>
                      <Option value={8}>感冒药片 (盒)</Option>
                      <Option value={10}>手机电池 (个)</Option>
                      <Option value={11}>笔记本电脑 (台)</Option>
                      <Option value={13}>快递包裹 (件)</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name={`quantity_${item.id}`}
                    label="数量"
                    rules={[{ required: true, message: "请输入数量" }]}
                    style={{ marginBottom: 8 }}
                  >
                    <InputNumber min={1} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={4}>
                  <Form.Item
                    name={`unit_${item.id}`}
                    label="单位"
                    initialValue="件"
                    style={{ marginBottom: 8 }}
                  >
                    <Input placeholder="单位" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name={`batchNo_${item.id}`}
                    label="批次号(可选)"
                    style={{ marginBottom: 8 }}
                  >
                    <Input placeholder="不填则自动生成" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name={`prodDate_${item.id}`}
                    label="生产日期(可选)"
                    style={{ marginBottom: 0 }}
                  >
                    <DatePicker style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name={`expDate_${item.id}`}
                    label="过期日期(可选)"
                    style={{ marginBottom: 0 }}
                  >
                    <DatePicker style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name={`volume_${item.id}`}
                    label="单位体积(m³)"
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      min={0}
                      step={0.01}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}

          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={handleAddItem}
          >
            添加商品
          </Button>

          <Form.Item name="remarks" label="备注" style={{ marginTop: 16 }}>
            <Input.TextArea rows={3} placeholder="如有特殊要求请备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MerchantInbound;
