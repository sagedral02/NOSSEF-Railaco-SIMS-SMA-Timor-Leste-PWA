from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("finance/fee-types", views.FeeTypeViewSet, basename="fee-type")
router.register("finance/fee-plans", views.FeePlanViewSet, basename="fee-plan")
router.register("finance/fee-assignments", views.AssignmentViewSet, basename="fee-assignment")
router.register("finance/discounts", views.DiscountViewSet, basename="discount")
router.register("finance/scholarships", views.ScholarshipViewSet, basename="scholarship")
router.register("finance/invoices", views.InvoiceViewSet, basename="invoice")
router.register("finance/payments", views.PaymentViewSet, basename="payment")
router.register("finance/receipts", views.ReceiptViewSet, basename="receipt")

urlpatterns = [
    path("finance/students/<uuid:student_id>/statement/", views.StatementView.as_view(), name="finance-statement"),
    path("finance/my/", views.MyFinanceView.as_view(), name="finance-my"),
    path("finance/reports/summary/", views.FinanceSummaryView.as_view(), name="finance-summary"),
    path("finance/reports/arrears/", views.ArrearsView.as_view(), name="finance-arrears"),
    *router.urls,
]
