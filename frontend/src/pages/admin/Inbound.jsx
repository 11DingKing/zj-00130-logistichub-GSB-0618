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
} from "antd";
import {
  InboxOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckOutlined,
  UploadOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { inboundAPI, warehouseAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import { STATUS_MAP, formatCapacity } from "../../utils/constants";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;

const AdminInbound = () => {
  const [statusFilter, setStatusFilter] = useState();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [checkModalVisible, setCheckModalVisible] = useState(false);
  const [putawayModalVisible, setPutawayModalVisible] = useState(false);
  const [putawayForm] = Form.useForm();
  const [checkForm] = Form.useForm();

  const {
    data: orders,
    loading,
    run: fetchOrders,
  } = useRequest(() => inboundAPI.getAll({ status: statusFilter }));

  const handleViewOrder = async (orderId) => {
    try {
      const response = await inboundAPI.getById(orderId);
      setSelectedOrder(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error("获取入库单详情失败");
    }
  };

  const handleCheckOrder = async (orderId) => {
    try {
      const response = await inboundAPI.getById(orderId);
      setSelectedOrder(response.data);
      checkForm.setFieldsValue({
        items: response.data.items?.map((item) => ({
          id: item.id,
          actualQuantity: item.planned_quantity,
        })),
      });
      setCheckModalVisible(true);
    } catch (err) {
      message.error("获取入库单详情失败");
    }
  };

  const handleConfirmCheck = async () => {
    try {
      const values = await checkForm.validateFields();
      await inboundAPI.check(selectedOrder.id, values);
      message.success("验货成功");
      setCheckModalVisible(false);
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || "验货失败");
    }
  };

  const handlePutaway = async (orderId) => {
    try {
      const response = await inboundAPI.getById(orderId);
      setSelectedOrder(response.data);
      putawayForm.setFieldsValue({
        items: response.data.items
          ?.filter((i) => i.status !== "completed")
          .map((item) => ({
            id: item.id,
            locationId: null,
            putawayQuantity: item.actual_quantity || item.planned_quantity,
          })),
      });
      setPutawayModalVisible(true);
    } catch (err) {
      message.error("获取入库单详情失败");
    }
  };

  const handleConfirmPutaway = async () => {
    try {
      const values = await putawayForm.validateFields();
      await inboundAPI.putaway(selectedOrder.id, values);
      message.success("上架成功");
      setPutawayModalVisible(false);
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || "上架失败");
    }
  };

  const handleComplete = async (orderId) => {
    try {
      await inboundAPI.complete(orderId);
      message.success("入库单已完成");
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || "操作失败");
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
      title: "商户",
      dataIndex: "merchant_name",
      width: 140,
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
      render: (v, r) => `${v} ${r.items?.[0]?.unit || ""}`,
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
      width: 200,
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewOrder(r.id)}
          >
            详情
          </Button>
          {r.status === "pending" && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleCheckOrder(r.id)}
            >
              验货
            </Button>
          )}
          {(r.status === "checking" || r.status === "putaway") && (
            <Button
              type="link"
              size="small"
              icon={<UploadOutlined />}
              onClick={() => handlePutaway(r.id)}
            >
              上架
            </Button>
          )}
          {r.status === "putaway" && (
            <Button
              type="primary"
              size="small"
              onClick={() => handleComplete(r.id)}
            >
              完成
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>
          入库管理
        </Title>
        <Text type="secondary">管理所有入库订单，包括验货、上架等操作</Text>
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
            <Button icon={<SearchOutlined />} onClick={fetchOrders}>
              刷新
            </Button>
          </Space>
        }
      >
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
        width={900}
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
              <Descriptions.Item label="商户">
                {selectedOrder.merchant_name}
              </Descriptions.Item>
              <Descriptions.Item label="仓库">
                {selectedOrder.warehouse_name}
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

            {selectedOrder.remarks && (
              <div>
                <Text type="secondary">备注:</Text>
                <div>{selectedOrder.remarks}</div>
              </div>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title="验货确认"
        open={checkModalVisible}
        onOk={handleConfirmCheck}
        onCancel={() => setCheckModalVisible(false)}
        okText="确认验货"
        width={700}
      >
        <Form form={checkForm} layout="vertical">
          <List
            dataSource={selectedOrder?.items}
            renderItem={(item) => (
              <List.Item key={item.id}>
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{item.category_name}</Text>
                      <Tag color="blue">{item.batch_no}</Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <span>
                        计划数量: {item.planned_quantity} {item.unit}
                      </span>
                      <Form.Item
                        name={[
                          "items",
                          selectedOrder?.items?.indexOf(item),
                          "actualQuantity",
                        ]}
                        label="实际数量"
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0} style={{ width: 200 }} />
                      </Form.Item>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Form>
      </Modal>

      <Modal
        title="上架操作"
        open={putawayModalVisible}
        onOk={handleConfirmPutaway}
        onCancel={() => setPutawayModalVisible(false)}
        okText="确认上架"
        width={800}
      >
        <Alert
          message="上架提示"
          description="请根据库位剩余容量进行分配。如果容量不足，请换库位或拆批上架。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={putawayForm} layout="vertical">
          <Form.List name="items">
            {(fields) => (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {fields.map((field, index) => {
                  const item = selectedOrder?.items?.[index];
                  if (!item || item.status === "completed") return null;

                  return (
                    <Card
                      key={field.key}
                      size="small"
                      title={
                        <Space>
                          <Text strong>{item.category_name}</Text>
                          <Tag color="blue">{item.batch_no}</Tag>
                          {item.expiry_date && (
                            <Tag color="warning">
                              保质期至 {item.expiry_date}
                            </Tag>
                          )}
                        </Space>
                      }
                    >
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            {...field}
                            name={[field.name, "locationId"]}
                            label="选择库位"
                            rules={[{ required: true, message: "请选择库位" }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Select placeholder="请选择库位">
                              <Option value={item.id || 1}>
                                库位 {item.id ? "WH-A-A1-1" : "WH-A-A1-2"}
                              </Option>
                              <Option value={item.id || 2}>
                                库位 {item.id ? "WH-A-A1-2" : "WH-A-A1-3"}
                              </Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            {...field}
                            name={[field.name, "putawayQuantity"]}
                            label={`上架数量 (${item.unit})`}
                            rules={[
                              { required: true, message: "请输入上架数量" },
                            ]}
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber
                              min={0}
                              max={
                                item.actual_quantity || item.planned_quantity
                              }
                              style={{ width: "100%" }}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary">
                          待上架:{" "}
                          {item.actual_quantity || item.planned_quantity}{" "}
                          {item.unit}
                          {item.expiry_date &&
                            ` · 保质期至: ${item.expiry_date}`}
                        </Text>
                      </div>
                    </Card>
                  );
                })}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminInbound;
