import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Tag,
  Space,
  Select,
  Button,
  Modal,
  Form,
  message,
  Typography,
  Descriptions,
  Row,
  Col,
  Statistic,
  Table as AntTable,
  Input,
  Alert,
} from "antd";
import {
  DollarOutlined,
  EyeOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { billAPI, statsAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import { BILL_STATUS_MAP, DISPUTE_STATUS_MAP, BILLING_METHOD_MAP } from "../../utils/constants";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const MerchantBills = () => {
  const [filters, setFilters] = useState({ status: "", billingPeriod: "" });
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [disputeForm] = Form.useForm();

  const {
    data: bills,
    loading,
    run: fetchBills,
  } = useRequest(() => billAPI.getMyBills(filters));

  const {
    data: billingStats,
    loading: statsLoading,
    run: fetchBillingStats,
  } = useRequest(() => statsAPI.getMerchantBilling());

  const { data: incomeTrend } = useRequest(() =>
    statsAPI.getIncomeTrend({ months: 6 }),
  );

  useEffect(() => {
    fetchBills();
    fetchBillingStats();
  }, [filters, fetchBills, fetchBillingStats]);

  const handleViewDetail = async (id) => {
    try {
      const response = await billAPI.getById(id);
      setSelectedBill(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error("获取账单详情失败");
    }
  };

  const openDisputeModal = () => {
    disputeForm.resetFields();
    setDisputeModalVisible(true);
  };

  const handleSubmitDispute = async (values) => {
    try {
      await billAPI.submitDispute(selectedBill.id, { reason: values.reason });
      message.success("申诉已提交，等待管理员审核");
      setDisputeModalVisible(false);
      fetchBills();
      fetchBillingStats();
      const response = await billAPI.getById(selectedBill.id);
      setSelectedBill(response.data);
    } catch (err) {
      message.error(err.response?.data?.error || "申诉提交失败");
    }
  };

  const getChartOption = () => {
    if (!incomeTrend?.trends) return {};

    const months = incomeTrend.trends.map((t) => t.month);
    const amounts = incomeTrend.trends.map((t) => t.total_income);

    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: months,
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: "{value} 元" },
      },
      series: [
        {
          type: "line",
          data: amounts,
          smooth: true,
          itemStyle: { color: "#1890ff" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(24, 144, 255, 0.3)" },
                { offset: 1, color: "rgba(24, 144, 255, 0.05)" },
              ],
            },
          },
        },
      ],
    };
  };

  const columns = [
    {
      title: "账单编号",
      dataIndex: "bill_no",
      width: 180,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: "账期",
      dataIndex: "billing_period",
      width: 100,
    },
    {
      title: "金额",
      dataIndex: "total_amount",
      width: 120,
      render: (val) => (
        <Text strong style={{ color: "#f5222d" }}>
          ¥{val.toFixed(2)}
        </Text>
      ),
    },
    {
      title: "明细项",
      dataIndex: "item_count",
      width: 80,
    },
    {
      title: "账单状态",
      dataIndex: "status",
      width: 100,
      render: (val) => {
        const status = BILL_STATUS_MAP[val];
        return <Tag color={status.color}>{status.text}</Tag>;
      },
    },
    {
      title: "争议状态",
      dataIndex: "dispute_status_info",
      width: 100,
      render: (val, record) => {
        const disputeStatus = val || record.dispute_status || 'none';
        const status = DISPUTE_STATUS_MAP[disputeStatus];
        if (disputeStatus === 'none') return '-';
        return <Tag color={status.color}>{status.text}</Tag>;
      },
    },
    {
      title: "出单时间",
      dataIndex: "issued_at",
      width: 160,
      render: (val) => (val ? dayjs(val).format("YYYY-MM-DD HH:mm") : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      fixed: "right",
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record.id)}
        >
          详情
        </Button>
      ),
    },
  ];

  const itemColumns = [
    {
      title: "库位",
      dataIndex: "location_code",
      width: 100,
    },
    {
      title: "货品",
      dataIndex: "category_name",
      width: 120,
    },
    {
      title: "计费方式",
      dataIndex: "billing_method",
      width: 120,
      render: (val) => BILLING_METHOD_MAP[val],
    },
    {
      title: "单价",
      dataIndex: "unit_price",
      width: 120,
      render: (val, record) =>
        record.billing_method === 'adjustment' ? '-' :
        `¥${val.toFixed(2)}/${record.billing_method === "monthly" ? "月" : record.billing_method === "daily" ? "天" : record.category_unit || "单位"}`,
    },
    {
      title: "数量",
      dataIndex: "quantity",
      width: 100,
      render: (val, record) => record.billing_method === 'adjustment' ? '-' : `${val} ${record.category_unit || ""}`,
    },
    {
      title: "天数",
      dataIndex: "days",
      width: 80,
      render: (val, record) => record.billing_method === 'adjustment' ? '-' : val,
    },
    {
      title: "金额",
      dataIndex: "amount",
      width: 100,
      render: (val) => <Text strong style={{ color: val < 0 ? '#52c41a' : '#f5222d' }}>{val < 0 ? '-' : ''}¥{Math.abs(val).toFixed(2)}</Text>,
    },
    {
      title: "说明",
      dataIndex: "description",
    },
  ];

  const disputeColumns = [
    {
      title: "申诉时间",
      dataIndex: "submitted_at",
      width: 160,
      render: (val) => dayjs(val).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "申诉理由",
      dataIndex: "reason",
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (val) => {
        const status = DISPUTE_STATUS_MAP[val];
        return <Tag color={status.color}>{status.text}</Tag>;
      },
    },
    {
      title: "处理说明",
      dataIndex: "admin_notes",
      width: 200,
      render: (val) => val || "-",
    },
  ];

  const canDispute = selectedBill && 
    ['issued', 'overdue', 'adjusted'].includes(selectedBill.status) && 
    (!selectedBill.disputes || !selectedBill.disputes.some(d => d.status === 'pending'));

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="累计消费"
              value={billingStats?.stats?.total_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已支付"
              value={billingStats?.stats?.paid_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待支付"
              value={billingStats?.stats?.unpaid_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="账单总数"
              value={billingStats?.stats?.total_bills || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="消费趋势" style={{ marginBottom: 16 }}>
        <ReactECharts option={getChartOption()} style={{ height: 250 }} />
      </Card>

      {billingStats?.stats?.overdue_bills > 0 && (
        <Card
          style={{
            marginBottom: 16,
            borderColor: "#ffa39e",
            background: "#fff1f0",
          }}
        >
          <Space>
            <ExclamationCircleOutlined
              style={{ fontSize: 20, color: "#f5222d" }}
            />
            <Text type="danger">
              您有 {billingStats.stats.overdue_bills} 张逾期账单，金额 ¥
              {billingStats.stats.unpaid_amount?.toFixed(2)}，请及时支付。
            </Text>
          </Space>
        </Card>
      )}

      <Card title="最近账单" size="small" style={{ marginBottom: 16 }}>
        <Table
          columns={columns.filter((c) => c.key !== "action")}
          dataSource={billingStats?.recentBills}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Card title="全部账单">
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="选择状态"
            style={{ width: 150 }}
            allowClear
            value={filters.status || undefined}
            onChange={(val) => setFilters({ ...filters, status: val || "" })}
          >
            {Object.entries(BILL_STATUS_MAP).map(([key, val]) => (
              <Option key={key} value={key}>
                {val.text}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="选择账期"
            style={{ width: 150 }}
            allowClear
            value={filters.billingPeriod || undefined}
            onChange={(val) =>
              setFilters({ ...filters, billingPeriod: val || "" })
            }
          >
            {[
              "2026-06",
              "2026-05",
              "2026-04",
              "2026-03",
              "2026-02",
              "2026-01",
            ].map((p) => (
              <Option key={p} value={p}>
                {p}
              </Option>
            ))}
          </Select>
        </Space>

        <Table
          columns={columns}
          dataSource={bills}
          rowKey="id"
          loading={loading || statsLoading}
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      <Modal
        title="账单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={950}
      >
        {selectedBill && (
          <div>
            <Descriptions
              bordered
              column={2}
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="账单编号">
                {selectedBill.bill_no}
              </Descriptions.Item>
              <Descriptions.Item label="账单状态">
                <Tag color={BILL_STATUS_MAP[selectedBill.status].color}>
                  {BILL_STATUS_MAP[selectedBill.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="争议状态">
                <Tag color={DISPUTE_STATUS_MAP[selectedBill.dispute_status || 'none'].color}>
                  {DISPUTE_STATUS_MAP[selectedBill.dispute_status || 'none'].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="账期">
                {selectedBill.billing_period}
              </Descriptions.Item>
              <Descriptions.Item label="原始金额">
                ¥{selectedBill.total_amount.toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="调整金额">
                {selectedBill.adjusted_amount ? <Text style={{ color: '#52c41a' }}>-¥{selectedBill.adjusted_amount.toFixed(2)}</Text> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最终应付金额" span={2}>
                <Text strong style={{ color: '#f5222d', fontSize: 18 }}>
                  ¥{(selectedBill.final_amount || selectedBill.total_amount).toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="出单时间">
                {selectedBill.issued_at
                  ? dayjs(selectedBill.issued_at).format("YYYY-MM-DD HH:mm")
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="支付时间">
                {selectedBill.paid_at
                  ? dayjs(selectedBill.paid_at).format("YYYY-MM-DD HH:mm")
                  : "-"}
              </Descriptions.Item>
              {selectedBill.remarks && (
                <Descriptions.Item label="备注" span={2}>
                  {selectedBill.remarks}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title="账单明细" style={{ marginBottom: 16 }}>
              <AntTable
                columns={itemColumns}
                dataSource={[...selectedBill.items, ...(selectedBill.adjustmentItems || [])]}
                rowKey="id"
                size="small"
                pagination={false}
                summary={(pageData) => {
                  let totalAmount = 0;
                  pageData.forEach(({ amount }) => {
                    totalAmount += amount;
                  });
                  return (
                    <AntTable.Summary>
                      <AntTable.Summary.Row>
                        <AntTable.Summary.Cell index={0} colSpan={6}>
                          <Text strong>合计（最终应付）</Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell index={6}>
                          <Text strong style={{ color: "#f5222d" }}>
                            ¥{(selectedBill.final_amount || selectedBill.total_amount).toFixed(2)}
                          </Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell
                          index={7}
                        ></AntTable.Summary.Cell>
                      </AntTable.Summary.Row>
                    </AntTable.Summary>
                  );
                }}
              />
            </Card>

            {selectedBill.disputes && selectedBill.disputes.length > 0 && (
              <Card size="small" title="申诉记录" style={{ marginBottom: 16 }}>
                <Table
                  columns={disputeColumns}
                  dataSource={selectedBill.disputes}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              </Card>
            )}

            {(selectedBill.status === 'issued' ||
              selectedBill.status === 'overdue') && (
              <Card
                size="small"
                style={{
                  marginBottom: 16,
                  background: "#fffbe6",
                  borderColor: "#ffec3d",
                }}
              >
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Text strong>支付信息</Text>
                  <Text>
                    请通过线下转账或联系客服完成支付，支付完成后账单状态将更新为已支付。
                  </Text>
                  <Text type="secondary">
                    银行账户：1234 5678 9012 3456（物流园对公账户）
                  </Text>
                </Space>
              </Card>
            )}

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Space>
                {canDispute && (
                  <Button
                    icon={<QuestionCircleOutlined />}
                    onClick={openDisputeModal}
                  >
                    发起申诉
                  </Button>
                )}
                <Button onClick={() => setDetailModalVisible(false)}>
                  关闭
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="发起账单申诉"
        open={disputeModalVisible}
        onCancel={() => setDisputeModalVisible(false)}
        footer={null}
        width={500}
      >
        <Alert
          message="请说明申诉理由"
          description="管理员将在1-3个工作日内审核您的申诉，请详细描述您对账单的疑问。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={disputeForm}
          layout="vertical"
          onFinish={handleSubmitDispute}
        >
          <Form.Item
            name="reason"
            label="申诉理由"
            rules={[{ required: true, message: '请填写申诉理由', min: 10 }]}
          >
            <TextArea rows={4} placeholder="请详细描述您对账单金额或明细的疑问..." maxLength={500} showCount />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">提交申诉</Button>
              <Button onClick={() => setDisputeModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MerchantBills;
