import { useState } from 'react';
import { Card, Table, Tag, Space, Select, Button, Modal, Form, InputNumber, message, Typography, Descriptions, Tabs, Row, Col, Statistic, Alert } from 'antd';
import { 
  StockOutlined, 
  SearchOutlined, 
  EyeOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { inventoryAPI, statsAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { INVENTORY_STATUS_MAP, TEMP_ZONE_MAP } from '../../utils/constants';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const AdminInventory = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [daysFilter, setDaysFilter] = useState(90);

  const { data: allInventory, loading: allLoading, run: fetchAll } = useRequest(
    () => inventoryAPI.getAll()
  );
  const { data: slowMoving, loading: slowLoading, run: fetchSlow } = useRequest(
    () => inventoryAPI.getSlowMoving({ days: daysFilter }),
    false
  );
  const { data: nearExpiry, loading: expiryLoading, run: fetchExpiry } = useRequest(
    () => inventoryAPI.getNearExpiry({ days: 30 }),
    false
  );
  const { data: expired, loading: expiredLoading, run: fetchExpired } = useRequest(
    () => inventoryAPI.getExpired(),
    false
  );
  const { data: slowRatio, loading: ratioLoading } = useRequest(
    () => statsAPI.getSlowMovingRatio({ days: daysFilter })
  );

  useState(() => {
    if (activeTab === 'slow') fetchSlow();
    if (activeTab === 'nearExpiry') fetchExpiry();
    if (activeTab === 'expired') fetchExpired();
  }, [activeTab, daysFilter, fetchSlow, fetchExpiry, fetchExpired]);

  const handleViewBatch = async (batchId) => {
    try {
      const response = await inventoryAPI.getBatchDetail(batchId);
      setSelectedBatch(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取批次详情失败');
    }
  };

  const handleCheckSlowMoving = async () => {
    try {
      const response = await inventoryAPI.checkSlowMoving({ days: daysFilter });
      message.success(`盘点完成：标记呆滞 ${response.data.slowMovingCount}，过期 ${response.data.expiredCount}，临期 ${response.data.nearExpiryCount}`);
      fetchAll();
      if (activeTab === 'slow') fetchSlow();
      if (activeTab === 'nearExpiry') fetchExpiry();
      if (activeTab === 'expired') fetchExpired();
    } catch (err) {
      message.error(err.response?.data?.error || '盘点失败');
    }
  };

  const getChartOption = () => {
    if (!slowRatio?.byMerchant) return {};
    
    const merchants = slowRatio.byMerchant.map(m => m.name);
    const quantities = slowRatio.byMerchant.map(m => m.slow_quantity);

    return {
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: merchants
      },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: quantities,
        itemStyle: { color: '#faad14' }
      }]
    };
  };

  const commonColumns = [
    {
      title: '批次号',
      dataIndex: 'batch_no',
      width: 140,
      render: (v, r) => (
        <a onClick={() => handleViewBatch(r.id)} style={{ fontWeight: 500 }}>{v}</a>
      )
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      width: 120
    },
    {
      title: '品类',
      dataIndex: 'category_name',
      width: 100
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 80,
      render: (v, r) => `${v} ${r.unit}`
    },
    {
      title: '库位',
      dataIndex: 'location_code',
      width: 100
    },
    {
      title: '仓库',
      dataIndex: 'warehouse_name',
      width: 120
    },
    {
      title: '入库日期',
      dataIndex: 'inbound_date',
      width: 100,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD') : '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => {
        const status = INVENTORY_STATUS_MAP[v];
        return <Tag color={status?.color}>{status?.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewBatch(r.id)}>
          详情
        </Button>
      )
    }
  ];

  const expiryColumns = [
    ...commonColumns.slice(0, 5),
    {
      title: '过期时间',
      dataIndex: 'expiry_date',
      width: 120,
      render: (v, r) => (
        <Space>
          {dayjs(v).format('YYYY-MM-DD')}
          {r.days_to_expiry !== undefined && (
            <Tag color={r.days_to_expiry <= 7 ? 'error' : r.days_to_expiry <= 15 ? 'warning' : 'processing'}>
              {r.days_to_expiry > 0 ? `剩余${r.days_to_expiry}天` : `已过期${Math.abs(r.days_to_expiry)}天`}
            </Tag>
          )}
        </Space>
      )
    },
    ...commonColumns.slice(5)
  ];

  const slowColumns = [
    ...commonColumns.slice(0, 5),
    {
      title: '未动天数',
      dataIndex: 'days_immobile',
      width: 100,
      render: (v) => v ? `${v} 天` : '-'
    },
    ...commonColumns.slice(5)
  ];

  const getCurrentData = () => {
    switch (activeTab) {
      case 'all': return allInventory;
      case 'slow': return slowMoving;
      case 'nearExpiry': return nearExpiry;
      case 'expired': return expired;
      default: return allInventory;
    }
  };

  const getCurrentLoading = () => {
    switch (activeTab) {
      case 'all': return allLoading;
      case 'slow': return slowLoading;
      case 'nearExpiry': return expiryLoading;
      case 'expired': return expiredLoading;
      default: return allLoading;
    }
  };

  const getCurrentColumns = () => {
    switch (activeTab) {
      case 'nearExpiry':
      case 'expired': return expiryColumns;
      case 'slow': return slowColumns;
      default: return commonColumns;
    }
  };

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>库存管理</Title>
        <Text type="secondary">管理所有库存批次，包括正常、临期、过期、呆滞等状态</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><StockOutlined /> 总库存数量</Space>}
              value={allInventory?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0}
              suffix="件"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><ClockCircleOutlined /> 呆滞库存</Space>}
              value={slowRatio?.slowMoving?.slow_quantity || 0}
              suffix="件"
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ marginTop: 8 }}>
              <Tag color="processing">占比: {slowRatio?.quantityRatio || 0}%</Tag>
              <Tag color="blue">影响商户: {slowRatio?.slowMoving?.slow_merchants || 0} 家</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><WarningOutlined /> 临期库存</Space>}
              value={nearExpiry?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0}
              suffix="件"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><ExclamationCircleOutlined /> 过期库存</Space>}
              value={expired?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0}
              suffix="件"
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      {activeTab === 'slow' && slowRatio && (
        <Card 
          title="商户呆滞库存排行" 
          className="card-shadow" 
          style={{ marginTop: 16 }}
          size="small"
        >
          <ReactECharts option={getChartOption()} style={{ height: 200 }} notMerge />
        </Card>
      )}

      <Card 
        className="card-shadow" 
        style={{ marginTop: 16 }}
        title={
          <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab}
            type="card"
          >
            <TabPane tab={<Space><StockOutlined /> 全部库存</Space>} key="all" />
            <TabPane tab={<Space><ClockCircleOutlined /> 呆滞库存</Space>} key="slow" />
            <TabPane tab={<Space><WarningOutlined /> 临期库存 (30天内)</Space>} key="nearExpiry" />
            <TabPane tab={<Space><ExclamationCircleOutlined /> 过期库存</Space>} key="expired" />
          </Tabs>
        }
        extra={
          <Space>
            {activeTab === 'slow' && (
              <Select
                value={daysFilter}
                onChange={setDaysFilter}
                style={{ width: 140 }}
              >
                <Option value={60}>60天未动</Option>
                <Option value={90}>90天未动</Option>
                <Option value={180}>180天未动</Option>
              </Select>
            )}
            <Button 
              type="primary" 
              icon={<SyncOutlined />}
              onClick={handleCheckSlowMoving}
            >
              滚动盘点
            </Button>
            <Button icon={<SearchOutlined />} onClick={fetchAll}>刷新</Button>
          </Space>
        }
      >
        {activeTab === 'slow' && (
          <Alert
            message="呆滞库存预警"
            description={`检测阈值：${daysFilter}天未发生出入库操作。请及时通知相关商户进行处理。`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        {activeTab === 'expired' && (
          <Alert
            message="过期库存警告"
            description="以下批次已过期，已自动锁定，禁止出库。请通知商户尽快处理。"
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        {activeTab === 'nearExpiry' && (
          <Alert
            message="临期库存提醒"
            description="以下批次将在30天内过期，出库时已自动优先分配。请提醒商户尽快安排出库。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Table
          columns={getCurrentColumns()}
          dataSource={getCurrentData()}
          loading={getCurrentLoading()}
          rowKey="id"
          rowClassName={(r) => `batch-${r.status}`}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>

      <Modal
        title="批次详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedBatch && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="批次号">{selectedBatch.batch_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={INVENTORY_STATUS_MAP[selectedBatch.status]?.color}>
                  {INVENTORY_STATUS_MAP[selectedBatch.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="商户">{selectedBatch.merchant_name}</Descriptions.Item>
              <Descriptions.Item label="品类">{selectedBatch.category_name}</Descriptions.Item>
              <Descriptions.Item label="数量">{selectedBatch.quantity} {selectedBatch.unit}</Descriptions.Item>
              <Descriptions.Item label="库位">{selectedBatch.location_code}</Descriptions.Item>
              <Descriptions.Item label="入库日期">
                {dayjs(selectedBatch.inbound_date).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="生产日期">
                {selectedBatch.production_date || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="过期日期">
                {selectedBatch.expiry_date ? (
                  <Space>
                    {dayjs(selectedBatch.expiry_date).format('YYYY-MM-DD')}
                    {selectedBatch.days_to_expiry !== undefined && (
                      <Tag color={selectedBatch.days_to_expiry <= 0 ? 'error' : 'warning'}>
                        {selectedBatch.days_to_expiry > 0 
                          ? `剩余${selectedBatch.days_to_expiry}天` 
                          : `已过期${Math.abs(selectedBatch.days_to_expiry)}天`}
                      </Tag>
                    )}
                  </Space>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最后出库">
                {selectedBatch.last_outbound_date 
                  ? dayjs(selectedBatch.last_outbound_date).format('YYYY-MM-DD') 
                  : '未出库'}
              </Descriptions.Item>
            </Descriptions>

            {selectedBatch.transactions?.length > 0 && (
              <Card title="交易记录" size="small" type="inner">
                <Table
                  columns={[
                    { 
                      title: '时间', 
                      dataIndex: 'txn_date', 
                      render: v => dayjs(v).format('YYYY-MM-DD HH:mm') 
                    },
                    { 
                      title: '类型', 
                      dataIndex: 'txn_type', 
                      render: v => <Tag>{v}</Tag> 
                    },
                    { 
                      title: '数量', 
                      dataIndex: 'quantity', 
                      render: (v, r) => `${v} ${r.unit || ''}` 
                    },
                    { 
                      title: '操作人', 
                      dataIndex: 'operator_name' 
                    }
                  ]}
                  dataSource={selectedBatch.transactions}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default AdminInventory;
