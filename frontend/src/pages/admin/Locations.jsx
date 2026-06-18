import { useState, useEffect } from "react";
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Space,
  Select,
  Input,
  Button,
  Modal,
  Form,
  InputNumber,
  message,
  Typography,
  Progress,
  Tooltip,
} from "antd";
import {
  AppstoreOutlined,
  SearchOutlined,
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { warehouseAPI, locationAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import {
  LOCATION_STATUS_MAP,
  TEMP_ZONE_MAP,
  formatCapacity,
  formatPercent,
} from "../../utils/constants";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;

const AdminLocations = () => {
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [locationDetail, setLocationDetail] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState();
  const [tempFilter, setTempFilter] = useState();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();

  const { data: warehouses, loading: whLoading } = useRequest(() =>
    warehouseAPI.getAll(),
  );
  const {
    data: locations,
    loading: locLoading,
    run: fetchLocations,
  } = useRequest(
    () =>
      locationAPI.getAll({
        warehouseId: selectedWarehouse,
        status: statusFilter,
        temperatureZone: tempFilter,
      }),
    false,
  );

  useEffect(() => {
    if (warehouses && warehouses.length > 0) {
      setSelectedWarehouse(warehouses[0].id);
    }
  }, [warehouses]);

  useEffect(() => {
    if (selectedWarehouse) {
      fetchLocations();
    }
  }, [selectedWarehouse, statusFilter, tempFilter, fetchLocations]);

  const handleCreateLocation = async () => {
    try {
      const values = await createForm.validateFields();
      await locationAPI.create({
        ...values,
        warehouseId: selectedWarehouse,
      });
      message.success("库位创建成功");
      setCreateModalVisible(false);
      createForm.resetFields();
      fetchLocations();
    } catch (err) {
      message.error(err.response?.data?.error || "创建失败");
    }
  };

  const handleViewLocation = async (locationId) => {
    try {
      const response = await locationAPI.getById(locationId);
      setLocationDetail(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error("获取库位详情失败");
    }
  };

  const filteredLocations =
    locations?.filter((l) =>
      l.code.toLowerCase().includes(searchText.toLowerCase()),
    ) || [];

  const locationStats =
    warehouses?.map((wh) => {
      const whLocs = locations?.filter((l) => l.warehouse_id === wh.id) || [];
      return {
        ...wh,
        totalLocs: whLocs.length,
        occupiedLocs: whLocs.filter((l) => l.status === "occupied").length,
        usedCap: whLocs.reduce((sum, l) => sum + (l.used_capacity || 0), 0),
        totalCap: whLocs.reduce((sum, l) => sum + (l.capacity || 0), 0),
      };
    }) || [];

  const columns = [
    {
      title: "库位编码",
      dataIndex: "code",
      width: 120,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: "仓库",
      dataIndex: "warehouse_name",
      width: 120,
    },
    {
      title: "位置",
      dataIndex: "row",
      width: 100,
      render: (v, r) => `${v}排-${r.column}列-${r.layer}层`,
    },
    {
      title: "温区",
      dataIndex: "temperature_zone",
      width: 80,
      render: (v) => {
        const tz = TEMP_ZONE_MAP[v];
        return <Tag color={tz?.color}>{tz?.text}</Tag>;
      },
    },
    {
      title: "总容量",
      dataIndex: "capacity",
      width: 100,
      render: (v) => formatCapacity(v),
    },
    {
      title: "已用容量",
      dataIndex: "used_capacity",
      width: 100,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{formatCapacity(v)}</span>
          <Progress
            percent={r.utilization_rate}
            size="small"
            strokeColor={
              r.utilization_rate > 90
                ? "#f5222d"
                : r.utilization_rate > 70
                  ? "#faad14"
                  : "#52c41a"
            }
          />
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      render: (v) => {
        const status = LOCATION_STATUS_MAP[v];
        return <Tag color={status?.color}>{status?.text}</Tag>;
      },
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_, r) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewLocation(r.id)}
            />
          </Tooltip>
          <Tooltip title="调整库位">
            <Button type="link" size="small" icon={<EditOutlined />} />
          </Tooltip>
          <Tooltip title="锁定库位">
            <Button type="link" size="small" danger icon={<LockOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>
          库位管理
        </Title>
        <Text type="secondary">查看和管理所有仓库的库位使用情况</Text>
      </div>

      <Row gutter={[16, 16]}>
        {locationStats.map((wh) => (
          <Col span={6} key={wh.id}>
            <Card
              className="card-shadow"
              style={{
                cursor: "pointer",
                border:
                  selectedWarehouse === wh.id
                    ? "2px solid #1890ff"
                    : "1px solid #f0f0f0",
              }}
              onClick={() => setSelectedWarehouse(wh.id)}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Space>
                  <AppstoreOutlined
                    style={{ fontSize: 24, color: "#1890ff" }}
                  />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {wh.name}
                    </div>
                    <Text type="secondary">
                      {wh.code} · {TEMP_ZONE_MAP[wh.temperature_zone]?.text}
                    </Text>
                  </div>
                </Space>
                <div style={{ marginTop: 12 }}>
                  <Row gutter={8}>
                    <Col span={8}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          color: "#1890ff",
                        }}
                      >
                        {wh.totalLocs}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        总库位
                      </Text>
                    </Col>
                    <Col span={8}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          color: "#faad14",
                        }}
                      >
                        {wh.occupiedLocs}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        已占用
                      </Text>
                    </Col>
                    <Col span={8}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          color: "#52c41a",
                        }}
                      >
                        {wh.totalCap > 0
                          ? Math.round((wh.usedCap / wh.totalCap) * 100)
                          : 0}
                        %
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        利用率
                      </Text>
                    </Col>
                  </Row>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        className="card-shadow"
        style={{ marginTop: 16 }}
        title="库位列表"
        extra={
          <Space>
            <Input
              placeholder="搜索库位编码"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="状态筛选"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
              allowClear
            >
              {Object.entries(LOCATION_STATUS_MAP).map(([key, val]) => (
                <Option key={key} value={key}>
                  {val.text}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="温区筛选"
              value={tempFilter}
              onChange={setTempFilter}
              style={{ width: 120 }}
              allowClear
            >
              {Object.entries(TEMP_ZONE_MAP).map(([key, val]) => (
                <Option key={key} value={key}>
                  {val.text}
                </Option>
              ))}
            </Select>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
              disabled={!selectedWarehouse}
            >
              新增库位
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredLocations}
          loading={locLoading || whLoading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个库位`,
          }}
        />
      </Card>

      <Modal
        title="库位详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {locationDetail && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={16}>
              <Col span={8}>
                <Text type="secondary">库位编码</Text>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {locationDetail.code}
                </div>
              </Col>
              <Col span={8}>
                <Text type="secondary">所属仓库</Text>
                <div style={{ fontSize: 16 }}>
                  {locationDetail.warehouse_name}
                </div>
              </Col>
              <Col span={8}>
                <Text type="secondary">温区</Text>
                <div>
                  <Tag
                    color={
                      TEMP_ZONE_MAP[locationDetail.temperature_zone]?.color
                    }
                  >
                    {TEMP_ZONE_MAP[locationDetail.temperature_zone]?.text}
                  </Tag>
                </div>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Text type="secondary">总容量</Text>
                <div>{formatCapacity(locationDetail.capacity)}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary">已用容量</Text>
                <div>{formatCapacity(locationDetail.used_capacity)}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary">可用容量</Text>
                <div style={{ color: "#52c41a", fontWeight: 500 }}>
                  {formatCapacity(locationDetail.available_capacity)}
                </div>
              </Col>
            </Row>
            <Progress
              percent={locationDetail.utilization_rate}
              strokeColor={
                locationDetail.utilization_rate > 90
                  ? "#f5222d"
                  : locationDetail.utilization_rate > 70
                    ? "#faad14"
                    : "#52c41a"
              }
            />

            {locationDetail.activeLease && (
              <Card title="当前租约" size="small" type="inner">
                <Row gutter={16}>
                  <Col span={12}>
                    <Text type="secondary">商户</Text>
                    <div>{locationDetail.activeLease.merchant_name}</div>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary">存储品类</Text>
                    <div>{locationDetail.activeLease.category_name}</div>
                  </Col>
                </Row>
              </Card>
            )}

            {locationDetail.inventory?.length > 0 && (
              <Card title="库存批次" size="small" type="inner">
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
                      render: (v) => <Tag>{v}</Tag>,
                    },
                  ]}
                  dataSource={locationDetail.inventory}
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
        title="新增库位"
        open={createModalVisible}
        onOk={handleCreateLocation}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        okText="创建"
        width={600}
      >
        <Form form={createForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="库位编码"
                rules={[{ required: true, message: "请输入库位编码" }]}
              >
                <Input placeholder="例如：WH-A-A1-1" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="temperatureZone"
                label="温区"
                rules={[{ required: true, message: "请选择温区" }]}
              >
                <Select placeholder="请选择温区">
                  <Option value="normal">常温</Option>
                  <Option value="cool">阴凉</Option>
                  <Option value="refrigerated">冷藏</Option>
                  <Option value="frozen">冷冻</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="row"
                label="排"
                rules={[{ required: true, message: "请输入排号" }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="column"
                label="列"
                rules={[{ required: true, message: "请输入列号" }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="layer"
                label="层"
                rules={[{ required: true, message: "请输入层号" }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="capacity"
                label="容量 (m³)"
                rules={[{ required: true, message: "请输入容量" }]}
              >
                <InputNumber min={0} step={0.1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminLocations;
