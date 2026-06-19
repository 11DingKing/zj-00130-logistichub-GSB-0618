import { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Select, Button, Modal, Form, Input, InputNumber, DatePicker, message, Typography, Descriptions, Row, Col, Statistic, Table as AntTable, Timeline, Tabs, Alert } from 'antd';
import { 
  DollarOutlined, 
  EyeOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseOutlined,
  FileTextOutlined,
  PlusOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  AuditOutlined,
  DislikeOutlined,
  EditOutlined
} from '@ant-design/icons';
import { billAPI, userAPI, statsAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { BILL_STATUS_MAP, DISPUTE_STATUS_MAP, BILLING_METHOD_MAP } from '../../utils/constants';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

const { Title, Text } = Typography;
const { Option } = Select;
const { MonthPicker } = DatePicker;
const { TextArea } = Input;
const { TabPane } = Tabs;

const AdminBills = () => {
  const [filters, setFilters] = useState({ status: '', merchantId: '', billingPeriod: '' });
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [reviewForm] = Form.useForm();
  const [generateForm] = Form.useForm();

  const { data: bills, loading, run: fetchBills } = useRequest(
    () => billAPI.getAll(filters)
  );

  const { data: summary, loading: summaryLoading, run: fetchSummary } = useRequest(
    () => billAPI.getSummary()
  );

  const { data: disputes, run: fetchDisputes } = useRequest(
    () => billAPI.getDisputes()
  );

  const { data: incomeTrend, run: fetchIncomeTrend } = useRequest(
    () => statsAPI.getIncomeTrend({ months: 12 })
  );

  const { data: merchants } = useRequest(
    () => userAPI.getMerchants()
  );

  useEffect(() => {
    fetchBills();
    fetchDisputes();
  }, [filters, fetchBills, fetchDisputes]);

  const handleGenerateBills = async (values) => {
    try {
      const year = values.month.year();
      const month = values.month.month() + 1;
      const response = await billAPI.generateMonthly({ 
        year, 
        month, 
        force: values.force || false 
      });
      message.success(response.data.message);
      setGenerateModalVisible(false);
      generateForm.resetFields();
      fetchBills();
      fetchSummary();
      fetchIncomeTrend();
    } catch (err) {
      message.error(err.response?.data?.error || '生成账单失败');
    }
  };

  const handleViewDetail = async (id) => {
    try {
      const response = await billAPI.getById(id);
      setSelectedBill(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取账单详情失败');
    }
  };

  const handleMarkPaid = async (id) => {
    Modal.confirm({
      title: '确认标记为已支付',
      icon: <CheckCircleOutlined />,
      content: '确认此账单已收到款项？',
      onOk: async () => {
        try {
          const response = await billAPI.markPaid(id);
          message.success(response.data.message);
          fetchBills();
          fetchSummary();
          if (selectedBill?.id === id) {
            const detailResponse = await billAPI.getById(id);
            setSelectedBill(detailResponse.data);
          }
        } catch (err) {
          message.error(err.response?.data?.error || '操作失败');
        }
      }
    });
  };

  const handleMarkOverdue = async (id) => {
    Modal.confirm({
      title: '确认标记为逾期',
      icon: <WarningOutlined />,
      content: '确认此账单已逾期？',
      onOk: async () => {
        try {
          const response = await billAPI.markOverdue(id);
          message.success(response.data.message);
          fetchBills();
          fetchSummary();
        } catch (err) {
          message.error(err.response?.data?.error || '操作失败');
        }
      }
    });
  };

  const handleCancelBill = async (id) => {
    Modal.confirm({
      title: '确认取消账单',
      icon: <ExclamationCircleOutlined />,
      content: '确定要取消此账单吗？',
      onOk: async () => {
        try {
          const response = await billAPI.cancel(id);
          message.success(response.data.message);
          fetchBills();
          fetchSummary();
          fetchDisputes();
        } catch (err) {
          message.error(err.response?.data?.error || '取消失败');
        }
      }
    });
  };

  const handleOpenReview = (dispute) => {
    setSelectedDispute(dispute);
    setReviewModalVisible(true);
  };

  const handleReviewDispute = async (values) => {
    try {
      await billAPI.reviewDispute(selectedDispute.id, values);
      message.success('审核完成');
      setReviewModalVisible(false);
      reviewForm.resetFields();
      fetchBills();
      fetchSummary();
      fetchDisputes();
      if (selectedBill) {
        const detailResponse = await billAPI.getById(selectedBill.id);
        setSelectedBill(detailResponse.data);
      }
    } catch (err) {
      message.error(err.response?.data?.error || '审核失败');
    }
  };

  const getChartOption = () => {
    if (!incomeTrend?.trends) return {};
    
    const months = incomeTrend.trends.map(t => t.month);
    const totalIncome = incomeTrend.trends.map(t => t.total_income);
    const receivedIncome = incomeTrend.trends.map(t => t.received_income);

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['总营收', '已收款'] },
      xAxis: {
        type: 'category',
        data: months
      },
      yAxis: { 
        type: 'value',
        axisLabel: { formatter: '{value} 元' }
      },
      series: [
        {
          name: '总营收',
          type: 'bar',
          data: totalIncome,
          itemStyle: { color: '#1890ff' }
        },
        {
          name: '已收款',
          type: 'bar',
          data: receivedIncome,
          itemStyle: { color: '#52c41a' }
        }
      ]
    };
  };

  const parseTierDetails = (tierDetailsStr) => {
    if (!tierDetailsStr) return null;
    try {
      return JSON.parse(tierDetailsStr);
    } catch (e) {
      return null;
    }
  };

  const columns = [
    {
      title: '账单编号',
      dataIndex: 'bill_no',
      width: 180,
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      width: 120
    },
    {
      title: '账期',
      dataIndex: 'billing_period',
      width: 100
    },
    {
      title: '金额',
      dataIndex: 'total_amount',
      width: 120,
      render: (val) => <Text strong style={{ color: '#f5222d' }}>¥{val.toFixed(2)}</Text>
    },
    {
      title: '明细项',
      dataIndex: 'item_count',
      width: 80
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (val, record) => {
        const status = BILL_STATUS_MAP[val];
        return (
          <Space direction="vertical" size={0}>
            <Tag color={status.color}>{status.text}</Tag>
            {record.dispute_status === 'pending' && (
              <Tag color="orange" style={{ fontSize: 11 }}>待审核申诉</Tag>
            )}
          </Space>
        );
      }
    },
    {
      title: '出单时间',
      dataIndex: 'issued_at',
      width: 160,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '支付时间',
      dataIndex: 'paid_at',
      width: 160,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.id)}
          >
            详情
          </Button>
          {(record.status === 'issued' || record.status === 'overdue' || record.status === 'adjusted') && (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleMarkPaid(record.id)}
            >
              标记支付
            </Button>
          )}
          {record.status === 'issued' && (
            <Button
              type="link"
              size="small"
              danger
              icon={<WarningOutlined />}
              onClick={() => handleMarkOverdue(record.id)}
            >
              标记逾期
            </Button>
          )}
          {(record.status === 'issued' || record.status === 'overdue' || record.status === 'disputed') && (
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => handleCancelBill(record.id)}
            >
              取消
            </Button>
          )}
        </Space>
      )
    }
  ];

  const itemColumns = [
    {
      title: '类型',
      dataIndex: 'is_adjustment',
      width: 90,
      render: (val) => val ? <Tag color="purple">红字调整</Tag> : <Tag color="blue">正常计费</Tag>
    },
    {
      title: '库位',
      dataIndex: 'location_code',
      width: 90
    },
    {
      title: '货品',
      dataIndex: 'category_name',
      width: 110
    },
    {
      title: '计费方式',
      dataIndex: 'billing_method',
      width: 100,
      render: (val) => val === 'adjustment' ? '-' : BILLING_METHOD_MAP[val]
    },
    {
      title: '单价',
      dataIndex: 'unit_price',
      width: 120,
      render: (val, record) => {
        if (record.is_adjustment) return '-';
        return `¥${val.toFixed(2)}/${record.billing_method === 'monthly' ? '月' : record.billing_method === 'daily' ? '天' : record.category_unit || '单位'}`;
      }
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 100,
      render: (val, record) => record.is_adjustment ? '-' : `${val} ${record.category_unit || ''}`
    },
    {
      title: '天数',
      dataIndex: 'days',
      width: 70,
      render: (val, record) => record.is_adjustment ? '-' : val
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 100,
      render: (val, record) => (
        <Text strong style={{ color: record.is_adjustment ? (val < 0 ? '#52c41a' : '#fa8c16') : '#f5222d' }}>
          ¥{val.toFixed(2)}
        </Text>
      )
    },
    {
      title: '说明',
      dataIndex: 'description'
    }
  ];

  const disputeColumns = [
    {
      title: '账单',
      dataIndex: 'bill_no',
      width: 160,
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{record.billing_period} · ¥{record.bill_total?.toFixed(2)}</Text>
        </Space>
      )
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      width: 130,
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <span>{text}</span>
          <Text type="secondary" style={{ fontSize: 11 }}>{record.merchant_company}</Text>
        </Space>
      )
    },
    {
      title: '申诉理由',
      dataIndex: 'reason',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (val) => {
        const s = DISPUTE_STATUS_MAP[val];
        return <Tag color={s.color}>{s.text}</Tag>;
      }
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      width: 150,
      render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => record.status === 'pending' ? (
        <Button
          type="primary"
          size="small"
          icon={<AuditOutlined />}
          onClick={() => handleOpenReview(record)}
        >
          审核
        </Button>
      ) : (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.bill_id)}>
          查看账单
        </Button>
      )
    }
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总营收"
              value={summary?.summary?.total_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已收款"
              value={summary?.summary?.received_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待收款"
              value={summary?.summary?.receivable_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="争议账单"
              value={summary?.summary?.disputed_bills || 0}
              suffix="张"
              valueStyle={{ color: '#fa8c16' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="营收趋势" style={{ marginBottom: 16 }}>
        <ReactECharts option={getChartOption()} style={{ height: 300 }} />
      </Card>

      <Card>
        <Tabs defaultActiveKey="bills">
          <TabPane tab="账单管理" key="bills">
            <Space style={{ marginBottom: 16 }} wrap>
              <Select
                placeholder="选择状态"
                style={{ width: 150 }}
                allowClear
                value={filters.status || undefined}
                onChange={(val) => setFilters({ ...filters, status: val || '' })}
              >
                {Object.entries(BILL_STATUS_MAP).map(([key, val]) => (
                  <Option key={key} value={key}>{val.text}</Option>
                ))}
              </Select>
              <Select
                placeholder="选择商户"
                style={{ width: 180 }}
                allowClear
                showSearch
                optionFilterProp="children"
                value={filters.merchantId || undefined}
                onChange={(val) => setFilters({ ...filters, merchantId: val || '' })}
              >
                {merchants?.map(m => (
                  <Option key={m.id} value={m.id}>{m.name} ({m.company_name})</Option>
                ))}
              </Select>
              <Select
                placeholder="选择账期"
                style={{ width: 150 }}
                allowClear
                value={filters.billingPeriod || undefined}
                onChange={(val) => setFilters({ ...filters, billingPeriod: val || '' })}
              >
                {['2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'].map(p => (
                  <Option key={p} value={p}>{p}</Option>
                ))}
              </Select>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setGenerateModalVisible(true)}
              >
                生成月度账单
              </Button>
            </Space>

            <Table
              columns={columns}
              dataSource={bills}
              rowKey="id"
              loading={loading || summaryLoading}
              scroll={{ x: 1400 }}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条记录`
              }}
            />
          </TabPane>
          <TabPane tab={
            <Space>
              <span>争议审核</span>
              {disputes?.filter(d => d.status === 'pending').length > 0 && (
                <Tag color="red">{disputes.filter(d => d.status === 'pending').length}</Tag>
              )}
            </Space>
          } key="disputes">
            {disputes?.filter(d => d.status === 'pending').length > 0 && (
              <Alert
                message="待处理申诉"
                description={`有 ${disputes.filter(d => d.status === 'pending').length} 条商户申诉等待审核，请及时处理。`}
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <Table
              columns={disputeColumns}
              dataSource={disputes}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title="生成月度账单"
        open={generateModalVisible}
        onCancel={() => {
          setGenerateModalVisible(false);
          generateForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={generateForm}
          layout="vertical"
          onFinish={handleGenerateBills}
        >
          <Form.Item
            name="month"
            label="选择账期月份"
            rules={[{ required: true, message: '请选择月份' }]}
          >
            <MonthPicker style={{ width: '100%' }} placeholder="选择月份" />
          </Form.Item>
          <Form.Item
            name="force"
            valuePropName="checked"
          >
            <Select placeholder="如该月账单已存在">
              <Option value={false}>跳过已生成的商户</Option>
              <Option value={true}>覆盖重新生成</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">生成账单</Button>
              <Button onClick={() => {
                setGenerateModalVisible(false);
                generateForm.resetFields();
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="账单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={1000}
      >
        {selectedBill && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="账单编号">{selectedBill.bill_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={BILL_STATUS_MAP[selectedBill.status].color}>
                  {BILL_STATUS_MAP[selectedBill.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="商户">{selectedBill.merchant_name}</Descriptions.Item>
              <Descriptions.Item label="公司">{selectedBill.merchant_company}</Descriptions.Item>
              <Descriptions.Item label="账期">{selectedBill.billing_period}</Descriptions.Item>
              <Descriptions.Item label="总金额">
                <Text strong style={{ color: '#f5222d', fontSize: 18 }}>
                  ¥{selectedBill.total_amount.toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="出单时间">
                {selectedBill.issued_at ? dayjs(selectedBill.issued_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="支付时间">
                {selectedBill.paid_at ? dayjs(selectedBill.paid_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              {selectedBill.adjusted_at && (
                <Descriptions.Item label="调整时间" span={2}>
                  {dayjs(selectedBill.adjusted_at).format('YYYY-MM-DD HH:mm')}
                </Descriptions.Item>
              )}
              {selectedBill.remarks && (
                <Descriptions.Item label="备注" span={2}>
                  {selectedBill.remarks}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title="账单明细" style={{ marginBottom: 16 }}>
              <AntTable
                columns={itemColumns}
                dataSource={selectedBill.items}
                rowKey="id"
                size="small"
                pagination={false}
                expandable={{
                  expandedRowRender: (record) => {
                    const tiers = parseTierDetails(record.tier_details);
                    if (!tiers) return null;
                    return (
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                        {tiers.map((t, i) => (
                          <div key={i}>
                            阶梯{t.tier}: {t.min}-{t.max || '以上'} @ ¥{t.price}/单位/天 × {t.quantity} × {t.days}天 = ¥{t.amount.toFixed(2)}
                          </div>
                        ))}
                      </div>
                    );
                  },
                  rowExpandable: (record) => !!record.tier_details
                }}
                summary={(pageData) => {
                  let totalAmount = 0;
                  pageData.forEach(({ amount }) => {
                    totalAmount += amount;
                  });
                  return (
                    <AntTable.Summary>
                      <AntTable.Summary.Row>
                        <AntTable.Summary.Cell index={0} colSpan={7}>
                          <Text strong>合计</Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell index={7}>
                          <Text strong style={{ color: '#f5222d' }}>¥{totalAmount.toFixed(2)}</Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell index={8}></AntTable.Summary.Cell>
                      </AntTable.Summary.Row>
                    </AntTable.Summary>
                  );
                }}
              />
            </Card>

            {selectedBill.disputes && selectedBill.disputes.length > 0 && (
              <Card size="small" title="争议记录" style={{ marginBottom: 16 }}>
                <Timeline
                  items={selectedBill.disputes.map(d => ({
                    color: d.status === 'pending' ? 'orange' : d.status === 'rejected' ? 'red' : 'purple',
                    children: (
                      <div>
                        <Space>
                          <Text strong>{DISPUTE_STATUS_MAP[d.status].text}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(d.created_at).format('YYYY-MM-DD HH:mm')} by {d.created_by_name}
                          </Text>
                        </Space>
                        <div style={{ marginTop: 4 }}>申诉理由：{d.reason}</div>
                        {d.admin_notes && (
                          <div style={{ marginTop: 4, color: '#595959' }}>
                            管理员回复（{d.reviewed_by_name}）：{d.admin_notes}
                            {d.adjustment_amount ? `（调整金额: ¥${d.adjustment_amount.toFixed(2)}）` : ''}
                          </div>
                        )}
                        {d.status === 'pending' && (
                          <Button
                            type="primary"
                            size="small"
                            style={{ marginTop: 8 }}
                            icon={<AuditOutlined />}
                            onClick={() => {
                              setDetailModalVisible(false);
                              handleOpenReview(d);
                            }}
                          >
                            立即审核
                          </Button>
                        )}
                      </div>
                    )
                  }))}
                />
              </Card>
            )}

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <Button icon={<DownloadOutlined />}>下载账单</Button>
                {(selectedBill.status === 'issued' || selectedBill.status === 'overdue' || selectedBill.status === 'adjusted') && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      handleMarkPaid(selectedBill.id);
                      setDetailModalVisible(false);
                    }}
                  >
                    标记已支付
                  </Button>
                )}
                <Button onClick={() => setDetailModalVisible(false)}>关闭</Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="审核账单申诉"
        open={reviewModalVisible}
        onCancel={() => {
          setReviewModalVisible(false);
          reviewForm.resetFields();
        }}
        footer={null}
        width={550}
      >
        {selectedDispute && (
          <div>
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="账单编号">{selectedDispute.bill_no}</Descriptions.Item>
              <Descriptions.Item label="商户">{selectedDispute.merchant_name} ({selectedDispute.merchant_company})</Descriptions.Item>
              <Descriptions.Item label="账单金额">¥{selectedDispute.bill_total?.toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="申诉理由">{selectedDispute.reason}</Descriptions.Item>
              <Descriptions.Item label="申请时间">{dayjs(selectedDispute.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            </Descriptions>

            <Form
              form={reviewForm}
              layout="vertical"
              onFinish={handleReviewDispute}
              initialValues={{ action: 'reject' }}
            >
              <Form.Item
                name="action"
                label="审核决定"
                rules={[{ required: true }]}
              >
                <Select>
                  <Option value="reject">
                    <Space>
                      <DislikeOutlined style={{ color: '#f5222d' }} />
                      驳回申诉（账单恢复正常状态）
                    </Space>
                  </Option>
                  <Option value="adjust">
                    <Space>
                      <EditOutlined style={{ color: '#722ed1' }} />
                      生成红字调整（调整账单金额）
                    </Space>
                  </Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prev, cur) => prev.action !== cur.action}
              >
                {({ getFieldValue }) => getFieldValue('action') === 'adjust' && (
                  <>
                    <Form.Item
                      name="adjustmentAmount"
                      label="调整金额（元）"
                      rules={[{ required: true, message: '请输入调整金额（负数为减款）' }]}
                      extra="正数为增加商户费用，负数为减少商户费用（红字冲减）"
                    >
                      <InputNumber style={{ width: '100%' }} step={1} precision={2} />
                    </Form.Item>
                    <Form.Item
                      name="adjustmentReason"
                      label="调整原因"
                      rules={[{ required: true, message: '请输入调整原因' }]}
                    >
                      <Input placeholder="例如：多计库存10天，冲减费用" />
                    </Form.Item>
                  </>
                )}
              </Form.Item>

              <Form.Item
                name="adminNotes"
                label="审核备注（商户可见）"
              >
                <TextArea rows={2} placeholder="请输入给商户的回复说明..." />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => {
                    setReviewModalVisible(false);
                    reviewForm.resetFields();
                  }}>取消</Button>
                  <Button type="primary" htmlType="submit">提交审核</Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminBills;
              >
                <Select>
                  <Option value="reject">
                    <Space>
                      <DislikeOutlined style={{ color: '#f5222d' }} />
                      驳回申诉（账单恢复正常状态）
                    </Space>
                  </Option>
                  <Option value="adjust">
                    <Space>
                      <EditOutlined style={{ color: '#722ed1' }} />
                      生成红字调整（调整账单金额）
                    </Space>
                  </Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prev, cur) => prev.action !== cur.action}
              >
                {({ getFieldValue }) => getFieldValue('action') === 'adjust' && (
                  <>
                    <Form.Item
                      name="adjustmentAmount"
                      label="调整金额（元）"
                      rules={[{ required: true, message: '请输入调整金额（负数为减款）' }]}
                      extra="正数为增加商户费用，负数为减少商户费用（红字冲减）"
                    >
                      <InputNumber style={{ width: '100%' }} step={1} precision={2} />
                    </Form.Item>
                    <Form.Item
                      name="adjustmentReason"
                      label="调整原因"
                      rules={[{ required: true, message: '请输入调整原因' }]}
                    >
                      <Input placeholder="例如：多计库存10天，冲减费用" />
                    </Form.Item>
                  </>
                )}
              </Form.Item>

              <Form.Item
                name="adminNotes"
                label="审核备注（商户可见）"
              >
                <TextArea rows={2} placeholder="请输入给商户的回复说明..." />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => {
                    setReviewModalVisible(false);
                    reviewForm.resetFields();
                  }}>取消</Button>
                  <Button type="primary" htmlType="submit">提交审核</Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminBills;
