import { useState } from "react";
import {
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
  Row,
  Col,
  Alert,
} from "antd";
import {
  FileTextOutlined,
  SearchOutlined,
  PlusOutlined,
  EyeOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { leaseAPI, locationAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import {
  STATUS_MAP,
  BILLING_METHOD_MAP,
  formatCapacity,
  formatCurrency,
} from "../../utils/constants";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;

const MerchantLeases = () => {
  const [statusFilter, setStatusFilter] = useState();
  const [selectedLease, setSelectedLease] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  const {
    data: leases,
    loading,
    run: fetchLeases,
  } = useRequest(() => leaseAPI.getMyLeases());
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

  const handleTerminate = async (leaseId) => {
    Modal.confirm({
      title: "确认终止租约",
      content: "终止前请确保该库位下的库存已全部出库。",
      onOk: async () => {
        try {
          await leaseAPI.terminate(leaseId);
          message.success("租约终止申请已提交");
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
      await leaseAPI.create({
        ...values,
        startDate: values.startDate?.format("YYYY-MM-DD"),
        endDate: values.endDate?.format("YYYY-MM-DD"),
      });
      message.success("租约申请提交成功，等待审核");
      setCreateModalVisible(false);
      form.resetFields();
      fetchLeases();
    } catch (err) {
      message.error(err.response?.data?.error || "提交失败");
    }
  };

  const handleOpenCreate = async () => {
    try {
      await availableLocations.refresh?.();
      setCreateModalVisible(true);
    } catch (e) {
      setCreateModalVisible(true);
    }
  };

  const columns = [
    {
      title: "租约ID",
      dataIndex: "id",
      width: 80,
    },
    {
      title: "库位",
      dataIndex: "location_code",
      width: 120,
    },
    {
      title: "仓库",
      dataIndex: "warehouse_name",
      width: 140,
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
      title: "当前库存",
      dataIndex: "current_stock",
      width: 100,
      render: (v) => v || 0,
    },
    {
      title: "计费方式",
      dataIndex: "billing_method",
      width: 100,
      render: (v) => BILLING_METHOD_MAP[v] || v,
    },
    {
      title: "单价",
      dataIndex: "unit_price",
      width: 100,
      render: (v, r) =>
        `${formatCurrency(v)}/${r.billing_method === "daily" ? "天" : r.billing_method === "monthly" ? "月" : r.billing_method === "per_pallet" ? "托" : "m³"}`,
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
      width: 150,
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewLease(r.id)}
          >
            详情
          </Button>
          {r.status === "active" && (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleTerminate(r.id)}
            >
              终止
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
          租约管理
        </Title>
        <Text type="secondary">管理您的库位租赁申请和租约</Text>
      </div>

      <Card
        className="card-shadow"
        title="我的租约"
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
              onClick={handleOpenCreate}
            >
              申请新租约
            </Button>
            <Button icon={<SearchOutlined />} onClick={fetchLeases}>
              刷新
            </Button>
          </Space>
        }
      >
        <Alert
          message="租约说明"
          description="申请租约后需等待仓管审核通过。审核通过后，库位将被分配给您使用。请确保存储的货物与申请的品类一致。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Table
          columns={columns}
          dataSource={leases}
          loading={loading}
          rowKey="id"
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
        footer={null}
        width={700}
      >
        {selectedLease && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedLease.status]?.color}>
                  {STATUS_MAP[selectedLease.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="库位">
                {selectedLease.location_code}
              </Descriptions.Item>
              <Descriptions.Item label="仓库">
                {selectedLease.warehouse_name}
              </Descriptions.Item>
              <Descriptions.Item label="库位温区">
                {selectedLease.location_temp_zone}
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
              <Descriptions.Item label="库位总容量">
                {formatCapacity(selectedLease.location_capacity)}
              </Descriptions.Item>
              <Descriptions.Item label="计费方式">
                {BILLING_METHOD_MAP[selectedLease.billing_method]}
              </Descriptions.Item>
              <Descriptions.Item label="单价">
                {formatCurrency(selectedLease.unit_price)}
              </Descriptions.Item>
              <Descriptions.Item label="开始日期">
                {selectedLease.start_date}
              </Descriptions.Item>
              <Descriptions.Item label="结束日期">
                {selectedLease.end_date || "长期"}
              </Descriptions.Item>
            </Descriptions>

            {selectedLease.inventory?.length > 0 && (
              <Card title="当前库存" size="small" type="inner">
                <Table
                  columns={[
                    { title: "批次号", dataIndex: "batch_no", width: 140 },
                    { title: "品类", dataIndex: "category_name" },
                    {
                      title: "数量",
                      dataIndex: "quantity",
                      render: (v, r) => `${v} ${r.unit}`,
                    },
                    {
                      title: "入库日期",
                      dataIndex: "inbound_date",
                      render: (v) => dayjs(v).format("YYYY-MM-DD"),
                    },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (v) => {
                        const status = STATUS_MAP[v];
                        return <Tag color={status?.color}>{status?.text}</Tag>;
                      },
                    },
                  ]}
                  dataSource={selectedLease.inventory}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              </Card>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title="申请库位租赁"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        okText="提交申请"
        width={600}
      >
        <Alert
          message="请确认"
          description="请根据货物的温区要求选择合适的库位。库位容量不足时，系统将提示您换库或拆批。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="locationId"
                label="选择库位"
                rules={[{ required: true, message: "请选择库位" }]}
              >
                <Select placeholder="请选择库位">
                  {availableLocations?.map((loc) => (
                    <Option key={loc.id} value={loc.id}>
                      {loc.code} ({loc.warehouse_name},{" "}
                      {formatCapacity(loc.available_capacity)}可用)
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
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
                  <Option value={5}>鲜肉</Option>
                  <Option value={6}>速冻水饺</Option>
                  <Option value={7}>冰淇淋</Option>
                  <Option value={8}>感冒药片</Option>
                  <Option value={9}>胰岛素</Option>
                  <Option value={10}>手机电池</Option>
                  <Option value={11}>笔记本电脑</Option>
                  <Option value={12}>耳机</Option>
                  <Option value={13}>快递包裹</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="agreedCapacity"
                label="约定容量 (m³)"
                rules={[{ required: true, message: "请输入约定容量" }]}
              >
                <InputNumber min={0} step={0.1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
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
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="unitPrice"
                label="单价 (元)"
                rules={[{ required: true, message: "请输入单价" }]}
              >
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="startDate"
                label="开始日期"
                rules={[{ required: true, message: "请选择开始日期" }]}
              >
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="endDate" label="结束日期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <Input.TextArea rows={3} placeholder="如有特殊要求请备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MerchantLeases;
