import { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Select, Button, Modal, Form, Input, message, Typography, Descriptions, Row, Col, Statistic, Table as AntTable, Timeline, Alert } from 'antd';
import { 
  EyeOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { billAPI, statsAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { BILL_STATUS_MAP, DISPUTE_STATUS_MAP, BILLING_METHOD_MAP } from '../../utils/constants';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const MerchantBills = () => {
  const [filters, setFilters] = useState({ status: '', billingPeriod: '' });
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [disputeForm] = Form.useForm();

  const { data: bills, loading, run: fetchBills } = useRequest(
    () => billAPI.getMyBills(filters)
  );

  const { data: billingStats, loading: statsLoading, run: fetchBillingStats } = useRequest(
    () => statsAPI.getMerchantBilling()
  );

  const { data: incomeTrend } = useRequest(
    () => statsAPI.getIncomeTrend({ months: 6 })
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
      message.error('获取账单详情失败');
    }
  };

  const handleOpenDispute = () => {
    setDisputeModalVisible(true);
  };

  const handleSubmitDispute = async () => {
    try {
      const values = await disputeForm.validateFields();
      await billAPI.createDispute(selectedBill.id, { reason: values.reason });
      message.success('申诉已提交，等待管理员审核');
      setDisputeModalVisible(false);
      disputeForm.resetFields();
      setDetailModalVisible(false);
      fetchBills();
    } catch (err) {
      message.error(err.response?.data?.error || '申诉提交失败');
    }
  };

  const canDispute = (bill) => {
    return ['issued', 'overdue'].includes(bill.status) && bill.dispute_status !== 'pending';
  };

  const getChartOption = () => {
    if (!incomeTrend?.trends) return {};
    
    const months = incomeTrend.trends.map(t => t.month);
    const amounts = incomeTrend.trends.map(t => t.total_income);

    return {
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: months
      },
      yAxis: { 
        type: 'value',
        axisLabel: { formatter: '{value} 元' }
      },
      series: [{
        type: 'line',
        data: amounts,
        smooth: true,
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
            ]
          }
        }
      }]
    };
  };

  const columns = [
    {
      title: '账单编号',
      dataIndex: 'bill_no',
      width: 180,
      render: (text) => <Text strong>{text}</Text>
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
      width: 100,
      render: (val, record) => {
        const status = BILL_STATUS_MAP[val];
        return (
          <Space direction="vertical" size={0}>
            <Tag color={status.color}>{status.text}</Tag>
            {record.dispute_status && record.dispute_status === 'pending' && (
              <Tag color="orange" style={{ fontSize: 11 }}>申诉审核中</Tag>
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
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record.id)}
        >
          详情
        </Button>
      )
    }
  ];

  const itemColumns = [
    {
      title: '库位',
      dataIndex: 'location_code',
      width: 100
    },
    {
      title: '货品',
      dataIndex: 'category_name',
      width: 120
    },
    {
      title: '计费方式',
      dataIndex: 'billing_method',
      width: 110,
      render: (val, record) => {
        if (record.is_adjustment) return <Tag color="purple">争议调整</Tag>;
        return BILLING_METHOD_MAP[val];
      }
    },
    {
      title: '单价',
      dataIndex: 'unit_price',
      width: 100,
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
      width: 80,
      render: (val, record) => record.is_adjustment ? '-' : val
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 100,
      render: (val, record) => (
        <Text strong style={{ color: record.is_adjustment && val < 0 ? '#52c41a' : '#f5222d' }}>
          {record.is_adjustment && val < 0 ? '' : ''}¥{val.toFixed(2)}
        </Text>
      )
    },
    {
      title: '说明',
      dataIndex: 'description',
      render: (val, record) => {
        if (record.is_adjustment) {
          return <Tag color="purple">红字调整</Tag>;
        }
        return val;
      }
    }
  ];

  const parseTierDetails = (tierDetailsStr) => {
    if (!tierDetailsStr) return null;
    try {
      return JSON.parse(tierDetailsStr);
    } catch (e) {
      return null;
    }
  };

  const renderTierBreakdown = (tierDetails) => {
    if (!tierDetails) return null;
    const tiers = parseTierDetails(tierDetails);
    if (!tiers || tiers.length === 0) return null;
    
    return (
      <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
        {tiers.map((t, i) => (
          <div key={i}>
            阶梯{t.tier}: {t.min}-{t.max || '以上'} @ ¥{t.price}/单位/天 × {t.quantity} × {t.days}天 = ¥{t.amount.toFixed(2)}
          </div>
        ))}
      </div>
    );
  };

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
              valueStyle={{ color: '#1890ff' }}
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
              valueStyle={{ color: '#52c41a' }}
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
              valueStyle={{ color: '#faad14' }}
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
          style={{ marginBottom: 16, borderColor: '#ffa39e', background: '#fff1f0' }}
        >
          <Space>
            <ExclamationCircleOutlined style={{ fontSize: 20, color: '#f5222d' }} />
            <Text type="danger">
              您有 {billingStats.stats.overdue_bills} 张逾期账单，金额 ¥{billingStats.stats.unpaid_amount?.toFixed(2)}，请及时支付。
            </Text>
          </Space>
        </Card>
      )}

      <Card title="最近账单" size="small" style={{ marginBottom: 16 }}>
        <Table
          columns={columns.filter(c => c.key !== 'action')}
          dataSource={billingStats?.recentBills}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Card title="全部账单">
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
        </Space>

        <Table
          columns={columns}
          dataSource={bills}
          rowKey="id"
          loading={loading || statsLoading}
          scroll={{ x: 1100 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
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
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="账单编号">{selectedBill.bill_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Space>
                  <Tag color={BILL_STATUS_MAP[selectedBill.status].color}>
                    {BILL_STATUS_MAP[selectedBill.status].text}
                  </Tag>
                  {selectedBill.disputes?.some(d => d.status === 'pending') && (
                    <Tag color="orange">申诉处理中</Tag>
                  )}
                </Space>
              </Descriptions.Item>
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
                  expandedRowRender: (record) => renderTierBreakdown(record.tier_details),
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
                        <AntTable.Summary.Cell index={0} colSpan={6}>
                          <Text strong>合计</Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell index={6}>
                          <Text strong style={{ color: '#f5222d' }}>¥{totalAmount.toFixed(2)}</Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell index={7}></AntTable.Summary.Cell>
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
                            {dayjs(d.created_at).format('YYYY-MM-DD HH:mm')}
                          </Text>
                        </Space>
                        <div style={{ marginTop: 4 }}>申诉理由：{d.reason}</div>
                        {d.admin_notes && (
                          <div style={{ marginTop: 4, color: '#595959' }}>
                            管理员回复：{d.admin_notes}
                            {d.adjustment_amount ? `（调整金额: ¥${d.adjustment_amount.toFixed(2)}）` : ''}
                          </div>
                        )}
                      </div>
                    )
                  }))}
                />
              </Card>
            )}

            {(selectedBill.status === 'issued' || selectedBill.status === 'overdue') && (
              <Card
                size="small"
                style={{ marginBottom: 16, background: '#fffbe6', borderColor: '#ffec3d' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>支付信息</Text>
                  <Text>请通过线下转账或联系客服完成支付，支付完成后账单状态将更新为已支付。</Text>
                  <Text type="secondary">银行账户：1234 5678 9012 3456（物流园对公账户）</Text>
                </Space>
              </Card>
            )}

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                {canDispute(selectedBill) && (
                  <Button
                    icon={<QuestionCircleOutlined />}
                    onClick={handleOpenDispute}
                  >
                    发起申诉
                  </Button>
                )}
                <Button onClick={() => setDetailModalVisible(false)}>关闭</Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="发起账单申诉"
        open={disputeModalVisible}
        onOk={handleSubmitDispute}
        onCancel={() => {
          setDisputeModalVisible(false);
          disputeForm.resetFields();
        }}
        okText="提交申诉"
        cancelText="取消"
      >
        <Alert
          message="申诉说明"
          description="请详细描述您对账单有疑问的地方，管理员将在1-3个工作日内审核处理。如申诉成立，将生成红字调整单。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={disputeForm} layout="vertical">
          <Form.Item
            name="reason"
            label="申诉理由"
            rules={[{ required: true, message: '请填写申诉理由', min: 5 }]}
          >
            <TextArea rows={4} placeholder="请详细描述账单争议点..." maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MerchantBills;
