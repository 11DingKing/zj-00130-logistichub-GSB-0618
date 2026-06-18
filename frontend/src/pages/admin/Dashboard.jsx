import { Row, Col, Card, Statistic, Table, Tag, Space, Typography, Alert } from 'antd';
import { 
  InboxOutlined, 
  SendOutlined, 
  StockOutlined, 
  AlertOutlined,
  RiseOutlined,
  WarningOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { statsAPI, inventoryAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { STATUS_MAP, INVENTORY_STATUS_MAP, TXN_TYPE_MAP, formatPercent, formatCapacity } from '../../utils/constants';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

const { Title, Text } = Typography;

const AdminDashboard = () => {
  const { data: overview, loading: overviewLoading } = useRequest(() => statsAPI.getOverview());
  const { data: slowMoving, loading: slowLoading } = useRequest(() => inventoryAPI.getSlowMoving({ days: 90 }));
  const { data: nearExpiry, loading: expiryLoading } = useRequest(() => inventoryAPI.getNearExpiry({ days: 30 }));
  const { data: txnStats, loading: txnLoading } = useRequest(() => statsAPI.getTransactions({ days: 30 }));

  const getChartOption = () => {
    if (!txnStats?.dailyStats) return {};
    
    const dateMap = {};
    txnStats.dailyStats.forEach(t => {
      if (!dateMap[t.txn_date]) {
        dateMap[t.txn_date] = { inbound: 0, outbound: 0 };
      }
      if (t.txn_type === 'inbound') {
        dateMap[t.txn_date].inbound += t.total_quantity;
      } else if (t.txn_type === 'outbound') {
        dateMap[t.txn_date].outbound += t.total_quantity;
      }
    });

    const dates = Object.keys(dateMap).sort();
    
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['入库量', '出库量'] },
      xAxis: {
        type: 'category',
        data: dates.map(d => dayjs(d).format('MM-DD'))
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '入库量',
          type: 'bar',
          data: dates.map(d => dateMap[d]?.inbound || 0),
          itemStyle: { color: '#52c41a' }
        },
        {
          name: '出库量',
          type: 'bar',
          data: dates.map(d => dateMap[d]?.outbound || 0),
          itemStyle: { color: '#1890ff' }
        }
      ]
    };
  };

  const warningColumns = [
    {
      title: '批次号',
      dataIndex: 'batch_no',
      width: 120
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
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => {
        const status = INVENTORY_STATUS_MAP[v];
        return <Tag color={status?.color}>{status?.text}</Tag>;
      }
    },
    {
      title: '详情',
      dataIndex: 'days_to_expiry',
      render: (v, r) => {
        if (r.status === 'near_expiry') {
          return <Text type="warning">剩余 {v} 天过期</Text>;
        } else if (r.status === 'slow_moving') {
          return <Text type="info">已存放 {r.days_immobile || '-'} 天未动</Text>;
        }
        return '-';
      }
    }
  ];

  const recentTxnColumns = [
    {
      title: '时间',
      dataIndex: 'txn_date',
      width: 150,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '类型',
      dataIndex: 'txn_type',
      width: 80,
      render: (v) => {
        const type = TXN_TYPE_MAP[v];
        return <Tag color={type?.color}>{type?.text}</Tag>;
      }
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
      render: (v, r) => `${v} ${r.unit || ''}`
    },
    {
      title: '库位',
      dataIndex: 'warehouse_name',
      width: 120
    }
  ];

  const warnings = [
    ...(nearExpiry || []).slice(0, 3).map(i => ({ ...i, status: 'near_expiry' })),
    ...(slowMoving || []).slice(0, 3).map(i => ({ ...i, status: 'slow_moving' }))
  ].slice(0, 5);

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>运营总览</Title>
        <Text type="secondary">欢迎使用物流枢纽运营平台，以下是今日运营数据概览</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><StockOutlined /> 总库位数</Space>}
              value={overview?.locations?.total_locations || 0}
              suffix="个"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">使用率: </Text>
              <Tag color="blue">{formatPercent(overview?.locations?.locationOccupancyRate)}</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><InboxOutlined /> 待处理入库</Space>}
              value={overview?.orders?.pending_inbound || 0}
              suffix="单"
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">处理中: </Text>
              <Tag color="cyan">{overview?.orders?.processing_inbound} 单</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><SendOutlined /> 待处理出库</Space>}
              value={overview?.orders?.pending_outbound || 0}
              suffix="单"
              valueStyle={{ color: '#fa8c16' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">拣货中: </Text>
              <Tag color="geekblue">{overview?.orders?.processing_outbound} 单</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><AlertOutlined /> 预警库存</Space>}
              value={(overview?.inventory?.near_expiry_quantity || 0) + (overview?.inventory?.slow_moving_quantity || 0)}
              suffix="件"
              valueStyle={{ color: '#f5222d' }}
            />
            <div style={{ marginTop: 8 }}>
              <Tag color="warning">临期 {overview?.inventory?.near_expiry_quantity || 0}</Tag>
              <Tag color="processing">呆滞 {overview?.inventory?.slow_moving_quantity || 0}</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card title={<Space><RiseOutlined /> 容量利用率</Space>} className="card-shadow">
            <div className="waterfall-stats">
              <div className="stat-item">
                <div className="value">{formatPercent(overview?.locations?.utilizationRate)}</div>
                <div className="label">整体容量</div>
              </div>
              <div className="stat-item">
                <div className="value">{formatPercent(overview?.locations?.locationOccupancyRate)}</div>
                <div className="label">库位占用</div>
              </div>
              <div className="stat-item">
                <div className="value">{formatPercent(overview?.inventory?.slowMovingRatio)}</div>
                <div className="label">呆滞占比</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title={<Space><StockOutlined /> 库存分布</Space>} className="card-shadow">
            <div className="waterfall-stats">
              <div className="stat-item">
                <div className="value" style={{ color: '#52c41a' }}>{overview?.inventory?.normal_quantity?.toFixed(0) || 0}</div>
                <div className="label">正常库存</div>
              </div>
              <div className="stat-item">
                <div className="value" style={{ color: '#faad14' }}>{overview?.inventory?.near_expiry_quantity?.toFixed(0) || 0}</div>
                <div className="label">临期库存</div>
              </div>
              <div className="stat-item">
                <div className="value" style={{ color: '#722ed1' }}>{overview?.inventory?.slow_moving_quantity?.toFixed(0) || 0}</div>
                <div className="label">呆滞库存</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title={<Space><ClockCircleOutlined /> 商户统计</Space>} className="card-shadow">
            <div className="waterfall-stats">
              <div className="stat-item">
                <div className="value" style={{ color: '#1890ff' }}>{overview?.merchants?.total_merchants || 0}</div>
                <div className="label">总商户数</div>
              </div>
              <div className="stat-item">
                <div className="value" style={{ color: '#52c41a' }}>{overview?.merchants?.active_merchants || 0}</div>
                <div className="label">活跃商户</div>
              </div>
              <div className="stat-item">
                <div className="value" style={{ color: '#fa8c16' }}>{overview?.orders?.pending_leases || 0}</div>
                <div className="label">待审租约</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {warnings.length > 0 && (
        <Alert
          message="库存预警"
          description={`发现 ${warnings.length} 条需要关注的库存记录，请及时处理`}
          type="warning"
          showIcon
          style={{ margin: '16px 0' }}
          icon={<WarningOutlined />}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title={<Space><WarningOutlined /> 库存预警列表</Space>} className="card-shadow">
            <Table
              columns={warningColumns}
              dataSource={warnings}
              loading={slowLoading || expiryLoading}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 300 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<Space><ClockCircleOutlined /> 最近交易流水</Space>} className="card-shadow">
            <Table
              columns={recentTxnColumns}
              dataSource={txnStats?.dailyStats?.slice(0, 10) || []}
              loading={txnLoading}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 300 }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title={<Space><RiseOutlined /> 近30天出入库趋势</Space>} 
        className="card-shadow"
        style={{ marginTop: 16 }}
      >
        <ReactECharts option={getChartOption()} style={{ height: 300 }} notMerge />
      </Card>
    </div>
  );
};

export default AdminDashboard;
