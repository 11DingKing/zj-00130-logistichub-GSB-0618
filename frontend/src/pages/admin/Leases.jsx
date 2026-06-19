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

const TIER_METHODS = ["per_pallet", "per_volume"];

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

  const parseTiers = (lease) => {
    if (!lease?.price_tiers) return [];
    try {
      const t = JSON.parse(lease.price_tiers);
      return Array.isArray(t) ? t : [];
    } catch {
      return [];
    }
  };

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
      await leaseAPI.create({
        ...values,
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
    const tiers = parseTiers(selectedLease);
    tierForm.setFieldsValue({
      tiers:
        tiers.length > 0
          ? tiers
          : [
              {
                min_usage: 0,
                max_usage: 100,
                unit_price: selectedLease?.unit_price,
              },
              {
                min_usage: 100,
                max_usage: 500,
                unit_price: selectedLease?.unit_price * 0.9,
              },
              {
                min_usage: 500,
                max_usage: null,
                unit_price: selectedLease?.unit_price * 0.8,
              },
            ],
    });
    setTierModalVisible(true);
  };

  const handleSaveTiers = async () => {
    try {
      const values = await tierForm.validateFields();
      const tiers = (values.tiers || [])
        .filter((t) => t && t.min_usage !== undefined && t.unit_price)
        .map((t) => ({
          min_usage: Number(t.min_usage) || 0,
          max_usage:
            t.max_usage === null ||
            t.max_usage === "" ||
            t.max_usage === undefined
              ? null
              : Number(t.max_usage),
          unit_price: Number(t.unit_price),
        }));

      for (let i = 0; i < tiers.length; i++) {
        if (tiers[i].unit_price <= 0) {
          message.error(`第${i + 1}档单价必须大于0`);
          return;
        }
        if (i > 0 && tiers[i].min_usage <= tiers[i - 1].min_usage) {
          message.error(`第${i + 1}档起始用量必须大于前一档`);
          return;
        }
        if (
          tiers[i].max_usage !== null &&
          tiers[i].max_usage <= tiers[i].min_usage
        ) {
          message.error(`第${i + 1}档上限必须大于起始值`);
          return;
        }
      }

      await leaseAPI.savePriceTiers(selectedLease.id, { priceTiers: tiers });
      message.success("阶梯价格已保存");
      setTierModalVisible(false);
      const refreshed = await leaseAPI.getById(selectedLease.id);
      setSelectedLease(refreshed.data);
      fetchLeases();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || "保存失败");
    }
  };

  const handleClearTiers = async () => {
    try {
      await leaseAPI.savePriceTiers(selectedLease.id, { priceTiers: [] });
      message.success("已恢复为一口价模式");
      setTierModalVisible(false);
      const refreshed = await leaseAPI.getById(selectedLease.id);
      setSelectedLease(refreshed.data);
      fetchLeases();
    } catch (err) {
      message.error(err.response?.data?.error || "操作失败");
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
      width: 120,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{BILLING_METHOD_MAP[v] || v}</span>
          {r.price_tiers &&
            (() => {
              try {
                const t = JSON.parse(r.price_tiers);
                if (Array.isArray(t) && t.length > 0) {
                  return (
                    <Tag color="purple" style={{ fontSize: 11 }}>
                      阶梯
                    </Tag>
                  );
                }
              } catch {}
              return null;
            })()}
        </Space>
      ),
    },
    {
      title: "单价",
      dataIndex: "unit_price",
      width: 130,
      render: (v, r) => {
        const unit =
          r.billing_method === "daily"
            ? "天"
            : r.billing_method === "monthly"
              ? "月"
              : r.billing_method === "per_pallet"
                ? "托·天"
                : "m³·天";
        const hasTiers = (() => {
          try {
            const t = JSON.parse(r.price_tiers);
            return Array.isArray(t) && t.length > 0;
          } catch {
            return false;
          }
        })();
        return (
          <span>
            {formatCurrency(v)}/{unit}
            {hasTiers && (
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                (阶梯)
              </Text>
            )}
          </span>
        );
      },
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
      width: 220,
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

  const tierColumns = [
    {
      title: "档位",
      key: "index",
      width: 60,
      render: (_, __, idx) => `第${idx + 1}档`,
    },
    {
      title: "起始用量",
      dataIndex: "min_usage",
      width: 100,
      render: (v) => `${v}`,
    },
    {
      title: "上限用量",
      dataIndex: "max_usage",
      width: 100,
      render: (v) => (v === null || v === undefined ? "∞ 以上" : v),
    },
    {
      title: "单价 (元/单位/天)",
      dataIndex: "unit_price",
      render: (v) => `¥${Number(v).toFixed(2)}`,
    },
  ];

  const currentTiers = parseTiers(selectedLease);

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
        footer={null}
        width={800}
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
                <Space>
                  {BILLING_METHOD_MAP[selectedLease.billing_method]}
                  {currentTiers.length > 0 && (
                    <Tag color="purple">阶梯计价</Tag>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="基础单价">
                {formatCurrency(selectedLease.unit_price)}
                {selectedLease.billing_method === "per_pallet"
                  ? "/托·天"
                  : selectedLease.billing_method === "per_volume"
                    ? "/m³·天"
                    : selectedLease.billing_method === "daily"
                      ? "/天"
                      : "/月"}
              </Descriptions.Item>
              <Descriptions.Item label="开始日期">
                {selectedLease.start_date}
              </Descriptions.Item>
              <Descriptions.Item label="结束日期">
                {selectedLease.end_date || "长期"}
              </Descriptions.Item>
            </Descriptions>

            {TIER_METHODS.includes(selectedLease.billing_method) && (
              <Card
                size="small"
                title={
                  <Space>
                    <FileTextOutlined />
                    阶梯价格配置
                    {currentTiers.length > 0 ? (
                      <Tag color="purple">已启用阶梯</Tag>
                    ) : (
                      <Tag>一口价模式</Tag>
                    )}
                  </Space>
                }
                extra={
                  <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={handleOpenTierConfig}
                  >
                    {currentTiers.length > 0 ? "编辑阶梯" : "配置阶梯"}
                  </Button>
                }
              >
                {currentTiers.length > 0 ? (
                  <Table
                    columns={tierColumns}
                    dataSource={currentTiers}
                    rowKey={(_, idx) => idx}
                    size="small"
                    pagination={false}
                  />
                ) : (
                  <Alert
                    message="当前为一口价模式"
                    description="按平均使用量直接乘以基础单价计费。点击「配置阶梯」可启用累进阶梯计价。"
                    type="info"
                    showIcon
                  />
                )}
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

            <div style={{ textAlign: "right" }}>
              <Space>
                {selectedLease.status === "pending" && (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={() => {
                      handleApprove(selectedLease.id);
                      setDetailModalVisible(false);
                    }}
                  >
                    审核通过
                  </Button>
                )}
                {selectedLease.status === "active" && (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => {
                      handleTerminate(selectedLease.id);
                      setDetailModalVisible(false);
                    }}
                  >
                    终止租约
                  </Button>
                )}
                <Button onClick={() => setDetailModalVisible(false)}>
                  关闭
                </Button>
              </Space>
            </div>
          </Space>
        )}
      </Modal>

      <Modal
        title={currentTiers.length > 0 ? "编辑阶梯价格" : "配置阶梯价格"}
        open={tierModalVisible}
        onCancel={() => setTierModalVisible(false)}
        width={700}
        footer={null}
      >
        <Alert
          message="累进阶梯计价说明"
          description="类似个人所得税计算方式：平均使用量落在不同档位区间的部分，按各档单价分别计费。例如 0-100 档 ¥5/托/天、100-500 档 ¥4.5/托/天、500 以上 ¥4/托/天，用量为 600 托时：100×¥5 + 400×¥4.5 + 100×¥4 = ¥2700/天。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={tierForm} layout="vertical">
          <Form.List name="tiers">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }, idx) => (
                  <Card
                    key={key}
                    size="small"
                    title={`第 ${idx + 1} 档`}
                    style={{ marginBottom: 8 }}
                    extra={
                      fields.length > 1 ? (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<MinusCircleOutlined />}
                          onClick={() => remove(name)}
                        >
                          删除
                        </Button>
                      ) : null
                    }
                  >
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, "min_usage"]}
                          label="起始用量"
                          rules={[{ required: true, message: "必填" }]}
                        >
                          <InputNumber
                            style={{ width: "100%" }}
                            min={0}
                            step={10}
                            placeholder="0"
                            disabled={idx === 0}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, "max_usage"]}
                          label="上限用量（空为无上限）"
                        >
                          <InputNumber
                            style={{ width: "100%" }}
                            min={0}
                            step={50}
                            placeholder="留空表示以上"
                            disabled={idx === fields.length - 1}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, "unit_price"]}
                          label="单价 (元)"
                          rules={[{ required: true, message: "必填" }]}
                        >
                          <InputNumber
                            style={{ width: "100%" }}
                            min={0.01}
                            step={0.1}
                            precision={2}
                            placeholder="0.00"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button
                  type="dashed"
                  onClick={() =>
                    add({
                      min_usage: 0,
                      max_usage: null,
                      unit_price: selectedLease?.unit_price,
                    })
                  }
                  block
                  icon={<PlusOutlined />}
                  style={{ marginBottom: 16 }}
                >
                  添加一档
                </Button>
              </>
            )}
          </Form.List>
          <Divider />
          <div style={{ textAlign: "right" }}>
            <Space>
              {currentTiers.length > 0 && (
                <Popconfirm
                  title="确认清除阶梯价格？"
                  description="清除后该租约将恢复为一口价计费模式。"
                  onConfirm={handleClearTiers}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button danger>清除阶梯，恢复一口价</Button>
                </Popconfirm>
              )}
              <Button onClick={() => setTierModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={handleSaveTiers}>
                保存阶梯配置
              </Button>
            </Space>
          </div>
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
        width={600}
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
                label="单价 (元)"
                rules={[{ required: true, message: "请输入单价" }]}
              >
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Alert
            message="提示"
            description="新建租约后默认使用一口价模式。租约审核通过后，可以在租约详情中配置阶梯累进计价。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
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
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminLeases;
