import { Row, Col, Card, Statistic, Table, Tag, Space, Typography, Alert } from 'antd';
import { 
  StockOutlined, 
  FileTextOutlined, 
  InboxOutlined, 
  SendOutlined,
  WarningOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { statsAPI, inventoryAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { STATUS_MAP, INVENTORY_STATUS_MAP, TXN_TYPE_MAP } from '../../utils/constants';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const MerchantDashboard = () => {
  const { data: overview, loading: overviewLoading } = useRequest(
    () => statsAPI.getMerchantOverview()
  );
  const { data: nearExpiry, loading: expiryLoading } = useRequest(
    () => inventoryAPI.getNearExpiry({ days: 30 })
  );
  const { data: slowMoving, loading: slowLoading } = useRequest(
    () => inventoryAPI.getSlowMoving({ days: 90 })
  );

  const warningColumns = [
    {
      title: '批次号',
      dataIndex: 'batch_no',
      width: 140
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

  const txnColumns = [
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
      title: '仓库',
      dataIndex: 'warehouse_name',
      width: 120
    }
  ];

  const warnings = [
    ...(nearExpiry || []).map(i => ({ ...i, status: 'near_expiry' })),
    ...(slowMoving || []).map(i => ({ ...i, status: 'slow_moving' }))
  ].slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>商户总览</Title>
        <Text type="secondary">欢迎回来，以下是您的库存和订单概览</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><StockOutlined /> 库存总量</Space>}
              value={overview?.inventory?.total_quantity || 0}
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">品类数: </Text>
              <Tag color="blue">{overview?.inventory?.category_count || 0} 种</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><FileTextOutlined /> 有效租约</Space>}
              value={overview?.leases?.active_leases || 0}
              suffix="份"
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8 }}>
              {overview?.leases?.pending_leases > 0 && (
                <Tag color="warning">待审核: {overview.leases.pending_leases} 份</Tag>
              )}
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><InboxOutlined /> 入库中</Space>}
              value={overview?.orders?.pending_inbound || 0}
              suffix="单"
              valueStyle={{ color: '#fa8c16' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">已完成: </Text>
              <Tag color="success">{overview?.orders?.completed_inbound} 单</Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><SendOutlined /> 出库中</Space>}
              value={overview?.orders?.pending_outbound || 0}
              suffix="单"
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">已完成: </Text>
              <Tag color="success">{overview?.orders?.completed_outbound} 单</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card className="card-shadow">
            <div className="waterfall-stats">
              <div className="stat-item">
                <div className="value" style={{ color: '#52c41a' }}>
                  {overview?.inventory?.total_quantity 
                    ? ((overview.inventory.total_quantity - (overview.inventory.near_expiry_qty || 0) - (overview.inventory.slow_moving_qty || 0)) / overview.inventory.total_quantity * 100).toFixed(1)
                    : 0}%
                </div>
                <div className="label">正常库存</div>
              </div>
              <div className="stat-item">
                <div className="value" style={{ color: '#faad14' }}>
                  {overview?.inventory?.near_expiry_qty || 0}
                </div>
                <div className="label">临期库存</div>
              </div>
              <div className="stat-item">
                <div className="value" style={{ color: '#722ed1' }}>
                  {overview?.inventory?.slow_moving_qty || 0}
                </div>
                <div className="label">呆滞库存</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {warnings.length > 0 && (
        <Alert
          message="库存提醒"
          description={`您有 ${warnings.length} 条库存需要关注，请及时处理`}
          type="warning"
          showIcon
          style={{ margin: '16px 0' }}
          icon={<WarningOutlined />}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title={<Space><WarningOutlined /> 库存预警</Space>} className="card-shadow">
            <Table
              columns={warningColumns}
              dataSource={warnings}
              loading={expiryLoading || slowLoading}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 300 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<Space><ClockCircleOutlined /> 最近交易</Space>} className="card-shadow">
            <Table
              columns={txnColumns}
              dataSource={overview?.recentTransactions || []}
              loading={overviewLoading}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 300 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MerchantDashboard;
